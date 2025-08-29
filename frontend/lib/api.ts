export const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_URL || "http://localhost:8000";

export async function signUpload(filename: string, contentType="video/mp4") {
  const r = await fetch(`${CONTROL_PLANE}/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content_type: contentType })
  });
  if(!r.ok) throw new Error("sign failed");
  return r.json() as Promise<{bucket:string; key:string; put_url:string; get_url:string;}>;
}

export async function putToB2(putUrl: string, file: File, contentType="video/mp4") {
  const r = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if(!r.ok) throw new Error(`upload failed: ${r.status}`);
}

export async function startModalJob(payload: any) {
  const r = await fetch(`${CONTROL_PLANE}/start-job`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error("start failed");
  return r.json() as Promise<{job_id:string; call_id:string; results_prefix:string;}>;
}

export async function pollJob(callId: string) {
  const r = await fetch(`${CONTROL_PLANE}/jobs/${callId}`);
  if(!r.ok) throw new Error("poll failed");
  return r.json();
}
