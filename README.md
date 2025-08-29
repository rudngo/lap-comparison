# Lap Compare (Vision-Only): **Modal + Backblaze B2 + Render + Vercel**

Zero local runs required. Connect this repo to:
- **Modal** (GPU/CPU jobs) via GitHub Action
- **Render** (FastAPI control-plane web service)
- **Vercel** (Next.js frontend)

## What this does
- Browser uploads video **directly to Backblaze B2** using a **pre-signed PUT URL** from the control-plane.
- Control-plane triggers a **Modal** job to process (vision-only) and write artifacts back to **B2**.
- Frontend polls the job and then displays/downloads artifacts via pre-signed GET URLs.

---

## 1) Fork this repo and set GitHub Secrets

In your GitHub repo settings → **Secrets and variables → Actions** add:

**Backblaze (S3-compatible)**
- `B2_S3_ENDPOINT` e.g. `https://s3.us-west-004.backblazeb2.com`
- `B2_REGION` e.g. `us-west-004`
- `B2_BUCKET` your bucket name (must exist)
- `B2_KEY_ID` scoped key id for the bucket
- `B2_APP_KEY` scoped key secret
- `B2_PREFIX` optional, e.g. `lapcompare/`

**Modal**
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

---

## 2) Deploy the Modal function (via GitHub Action)
The workflow `.github/workflows/modal-deploy.yml` deploys on every push to `main`.
It runs `modal deploy` using the secrets above.

> No local CLI needed. You can also trigger it manually from the **Actions** tab.

---

## 3) Deploy the control-plane (FastAPI) on Render
1. In Render, click **New +** → **Blueprint**.
2. Point it at this repo and choose the `render.yaml`.
3. Set the following **Environment Variables** in the Render service:
   - `B2_S3_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APP_KEY`, `B2_PREFIX` (same as GitHub Secrets)
4. Deploy. Take note of the public URL (e.g. `https://lapcompare-api.onrender.com`).

---

## 4) Deploy the frontend on Vercel
1. Import the repo into Vercel.
2. Set **Environment Variable**: `NEXT_PUBLIC_CONTROL_URL` to your Render URL (e.g. `https://lapcompare-api.onrender.com`).
3. Deploy. Visit the app and upload/analyze videos.

---

## Paths
- `control-plane/` — FastAPI service (Render web service). Signs uploads and triggers/polls Modal jobs.
- `modal/` — Modal function (`modal_app.py`). Pulls from B2, processes video, writes artifacts to B2.
- `frontend/` — Next.js app. Browser → B2 uploads, job start/poll, and results UI.
- `.github/workflows/modal-deploy.yml` — CI deploy to Modal on push.
- `render.yaml` — Render Blueprint for the control-plane.

---

## Notes
- To save cold-start time on Modal, the sample image uses **classical optical flow**. If you need RAFT/YOLO, uncomment the packages and add `gpu="T4"` to the function decorator.
- Large uploads: browser uploads directly to B2 (no API bottleneck).
- Artifacts (overlay/video, metrics, manifest) are stored in B2 under `B2_PREFIX/results/{job_id}/`.
