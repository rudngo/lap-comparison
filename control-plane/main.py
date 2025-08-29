import os, uuid
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import boto3
from botocore.client import Config
import modal

B2_ENDPOINT = os.environ["B2_S3_ENDPOINT"]
B2_REGION   = os.environ["B2_REGION"]
B2_BUCKET   = os.environ["B2_BUCKET"]
B2_PREFIX   = os.environ.get("B2_PREFIX", "lapcompare/")

s3 = boto3.client(
    "s3",
    region_name=B2_REGION,
    endpoint_url=B2_ENDPOINT,
    aws_access_key_id=os.environ["B2_KEY_ID"],
    aws_secret_access_key=os.environ["B2_APP_KEY"],
    config=Config(signature_version="s3v4"),
)

app = FastAPI(title="LapCompare Control Plane")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.post("/sign-upload")
def sign_upload(filename: str = Body(..., embed=True), content_type: str = Body("video/mp4", embed=True)):
    key = f"{B2_PREFIX}uploads/{uuid.uuid4()}_{filename}"
    put_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": B2_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=3600,
        HttpMethod="PUT",
    )
    get_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": B2_BUCKET, "Key": key},
        ExpiresIn=3600,
    )
    return {"bucket": B2_BUCKET, "key": key, "put_url": put_url, "get_url": get_url}

@app.post("/start-job")
def start_job(payload: dict = Body(...)):
    mode = payload.get("mode")
    if mode not in {"pair", "segments"}:
        raise HTTPException(400, "mode must be 'pair' or 'segments'")
    job_id = str(uuid.uuid4())
    outputs_prefix = f"{B2_PREFIX}results/{job_id}/"
    stub = modal.Stub.lookup("lap_compare_modal", "lap_compare_modal")
    f   = stub.functions["run_analysis"]
    call = f.spawn(job_id, mode, payload, {"bucket": B2_BUCKET, "prefix": outputs_prefix})
    return {"job_id": job_id, "call_id": call.object_id, "results_prefix": outputs_prefix}

@app.get("/jobs/{call_id}")
def job_status(call_id: str):
    stub = modal.Stub.lookup("lap_compare_modal", "lap_compare_modal")
    f    = stub.functions["run_analysis"]
    call = f.get(call_id)
    state = call.status()
    if state in ("PENDING","CREATED","QUEUED","SCHEDULED","RUNNING","STARTING"):
        return {"status":"running"}
    if state == "SUCCESS":
        res = call.get()
        return {"status":"finished", "result": res}
    if state == "CANCELLED":
        return {"status":"cancelled"}
    if state == "FAILURE":
        return {"status":"failed"}
    return {"status": state}
