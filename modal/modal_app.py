import os, json, tempfile, subprocess
import boto3
from botocore.client import Config
import modal

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "opencv-python-headless==4.9.0.80",
        "numpy==1.26.4",
        "scipy==1.11.4",
        "fastdtw==0.3.4",
        "Pillow==10.3.0",
        "shapely==2.0.3",
        # Optional heavy models (enable with GPU):
        # "torch>=2.1.0",
        # "torchvision>=0.16.0",
        # "ultralytics==8.1.0",
    )
)

stub = modal.Stub("lap_compare_modal", image=image)

def _b2():
    return boto3.client(
        "s3",
        region_name=os.environ["B2_REGION"],
        endpoint_url=os.environ["B2_S3_ENDPOINT"],
        aws_access_key_id=os.environ["B2_KEY_ID"],
        aws_secret_access_key=os.environ["B2_APP_KEY"],
        config=Config(signature_version="s3v4"),
    )

# ---- Minimal vision pipeline (classical flow) ----
import cv2, numpy as np
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

def _read_video(path):
    cap = cv2.VideoCapture(path)
    frames = []; fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    while True:
        ret, frame = cap.read()
        if not ret: break
        frames.append(frame)
    cap.release()
    return frames, fps

def _dense_flow(prev, curr):
    pg = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    cg = cv2.cvtColor(curr, cv2.COLOR_BGR2GRAY)
    return cv2.calcOpticalFlowFarneback(pg, cg, None, 0.5, 3, 25, 3, 5, 1.2, 0)

def _stabilize(frames):
    if not frames: return frames
    h, w = frames[0].shape[:2]; out=[frames[0]]
    prev=cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY); x=y=0.0
    for i in range(1,len(frames)):
        g=cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
        f=cv2.calcOpticalFlowFarneback(prev,g,None,0.5,3,15,3,5,1.1,0)
        x += float(np.median(f[...,0])); y += float(np.median(f[...,1]))
        M=np.float32([[1,0,-x],[0,1,-y]])
        out.append(cv2.warpAffine(frames[i], M, (w,h))); prev=g
    return out

def _speed_yaw(frames, fps):
    mags=[]; yaws=[]
    for i in range(1,len(frames)):
        flow=_dense_flow(frames[i-1], frames[i])
        fx, fy = flow[...,0], flow[...,1]
        mag=float(np.median(np.sqrt(fx*fx+fy*fy)))
        ang=np.arctan2(np.median(fy), np.median(fx))
        mags.append(mag); yaws.append(float(np.sin(ang)))
    mags=np.array(mags); yaws=np.array(yaws)
    if len(mags)>9:
        k=np.ones(9)/9; mags=np.convolve(mags,k,mode="same"); yaws=np.convolve(yaws,k,mode="same")
    dt=1.0/max(1.0,fps)
    dist=np.cumsum(mags*dt)
    if len(dist)==0: return np.array([]), np.array([]), np.array([])
    s=np.linspace(0, dist[-1], min(4000,len(dist)))
    v=np.interp(s, dist, mags); y=np.interp(s, dist, yaws)
    return s, v, y

def _dtw(vA,yA,vB,yB):
    A=np.stack([(vA-np.mean(vA))/(np.std(vA)+1e-6),(yA-np.mean(yA))/(np.std(yA)+1e-6)],axis=1)
    B=np.stack([(vB-np.mean(vB))/(np.std(vB)+1e-6),(yB-np.mean(yB))/(np.std(yB)+1e-6)],axis=1)
    _, path = fastdtw(A,B,dist=euclidean); return path

def _make_overlay(frA, frB, out_path, fps, delta_t):
    if not frA or not frB: return
    hA,wA=frA[0].shape[:2]; hB,wB=frB[0].shape[:2]
    H=max(hA,hB); W=wA+wB
    vw=cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W,H))
    n=min(len(frA), len(frB), len(delta_t))
    for i in range(n):
        canvas=np.zeros((H,W,3),np.uint8)
        canvas[:hA,:wA]=frA[i]; canvas[:hB,wA:wA+wB]=frB[i]
        txt=f"ΔT: {delta_t[i]:+.2f} s (B vs A)"
        cv2.putText(canvas, txt, (30,40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,255,0),2,cv2.LINE_AA)
        vw.write(canvas)
    vw.release()

def analyze_pair(pathA, pathB, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fA,fpsA=_read_video(pathA); fB,fpsB=_read_video(pathB); fps=fpsA or fpsB or 30.0
    fA=_stabilize(fA); fB=_stabilize(fB)
    sA,vA,yA=_speed_yaw(fA,fps); sB,vB,yB=_speed_yaw(fB,fps)
    if len(sA)==0 or len(sB)==0: raise RuntimeError("Could not derive proxies.")
    path=_dtw(vA,yA,vB,yB); delta=[(ib-ia)/fps for ia,ib in path]
    ov=os.path.join(out_dir,"overlay.mp4"); _make_overlay(fA,fB,ov,fps,delta)
    import csv
    csvp=os.path.join(out_dir,"metrics.csv")
    with open(csvp,"w",newline="") as f:
        w=csv.DictWriter(f, fieldnames=["distance","deltaT"])
        w.writeheader()
        for i,d in enumerate(sA[:len(delta)]): w.writerow({"distance":float(d),"deltaT":float(delta[i])})
    man={"summary":"Analysis complete","overlay":"overlay.mp4","metrics":"metrics.csv","insights":"insights.json"}
    with open(os.path.join(out_dir,"insights.json"),"w") as f: json.dump(man,f)
    return {"summary":man["summary"], "files":["overlay.mp4","metrics.csv","insights.json"]}

def analyze_segments(video_path, segA, segB, out_dir):
    def cut(src, start, end, dst):
        args=["ffmpeg","-y","-ss",str(start)]
        if end>0: args += ["-to",str(end)]
        args += ["-i",src,"-c","copy",dst]
        subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    a=os.path.join(out_dir,"A.mp4"); b=os.path.join(out_dir,"B.mp4")
    cut(video_path, segA.get("start",0.0), segA.get("end",0.0), a)
    cut(video_path, segB.get("start",0.0), segB.get("end",0.0), b)
    return analyze_pair(a,b,out_dir)

@stub.function(timeout=60*30)  # add gpu="T4" if enabling PyTorch/YOLO above
def run_analysis(job_id: str, mode: str, payload: dict, outputs: dict):
    s3 = _b2()
    bucket = outputs["bucket"]; prefix = outputs["prefix"]
    with tempfile.TemporaryDirectory() as td:
        out_dir = os.path.join(td, "out"); os.makedirs(out_dir, exist_ok=True)

        if mode == "pair":
            lapA = payload["lapA"]; lapB = payload["lapB"]
            a_local = os.path.join(td,"lapA.mp4"); b_local = os.path.join(td,"lapB.mp4")
            s3.download_file(lapA["bucket"], lapA["key"], a_local)
            s3.download_file(lapB["bucket"], lapB["key"], b_local)
            result = analyze_pair(a_local, b_local, out_dir)
        else:
            vid  = payload["video"]; segA=payload["segA"]; segB=payload["segB"]
            v_local = os.path.join(td,"video.mp4")
            s3.download_file(vid["bucket"], vid["key"], v_local)
            result = analyze_segments(v_local, segA, segB, out_dir)

        manifest = {"job_id": job_id, "summary": result["summary"], "artifacts": {}}
        for fname in result["files"]:
            key = f"{prefix}{fname}"
            s3.upload_file(os.path.join(out_dir, fname), bucket, key)
            url = s3.generate_presigned_url("get_object", Params={"Bucket":bucket,"Key":key}, ExpiresIn=3600)
            manifest["artifacts"][fname] = {"bucket": bucket, "key": key, "url": url}

        man_key = f"{prefix}manifest.json"
        s3.put_object(Bucket=bucket, Key=man_key, Body=json.dumps(manifest).encode("utf-8"))
        manifest["manifest_key"] = man_key
        return manifest
