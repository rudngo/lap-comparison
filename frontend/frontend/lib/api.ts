export const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_URL;

if (!CONTROL_PLANE || CONTROL_PLANE.trim() === "" || CONTROL_PLANE.includes("localhost")) {
  console.warn("NEXT_PUBLIC_CONTROL_URL is not set to a public URL. Current:", CONTROL_PLANE);
}

export async function signUpload(filename: string, contentType="video/mp4") {
  if (!CONTROL_PLANE) throw new Error("NEXT_PUBLIC_CONTROL_URL is not set");
  const r = await fetch(`${CONTROL_PLANE}/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content_type: contentType })
  });
  if(!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`sign failed: ${r.status} ${t}`);
  }
  return r.json() as Promise<{bucket:string; key:string; put_url:string; get_url:string;}>;
}

export async function putToB2(putUrl: string, file: File, contentType="video/mp4") {
  const r = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if(!r.ok) throw new Error(`upload failed: ${r.status}`);
}

export async function startModalJob(payload: any) {
  if (!CONTROL_PLANE) throw new Error("NEXT_PUBLIC_CONTROL_URL is not set");
  const r = await fetch(`${CONTROL_PLANE}/start-job`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if(!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`start failed: ${r.status} ${t}`);
  }
  return r.json() as Promise<{job_id:string; call_id:string; results_prefix:string;}>;
}

export async function pollJob(callId: string) {
  if (!CONTROL_PLANE) throw new Error("NEXT_PUBLIC_CONTROL_URL is not set");
  const r = await fetch(`${CONTROL_PLANE}/jobs/${callId}`);
  if(!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`poll failed: ${r.status} ${t}`);
  }
  return r.json();
}

export async function detectLaps(video: {bucket:string; key:string}, minLap=20, maxLap=300, topK=6) {
  if (!CONTROL_PLANE) throw new Error("NEXT_PUBLIC_CONTROL_URL is not set");
  const r = await fetch(`${CONTROL_PLANE}/detect-laps`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video, min_lap_s: minLap, max_lap_s: maxLap, top_k: topK })
  });
  if(!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`detect failed: ${r.status} ${t}`);
  }
  return r.json() as Promise<{laps:{start_s:number,end_s:number,score:number}[]}>;
}