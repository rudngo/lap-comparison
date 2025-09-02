'use client'
import React, { useState } from 'react';
import { signUpload, putToB2, startModalJob, pollJob, detectLaps, CONTROL_PLANE } from '../lib/api';
import { useRouter } from 'next/navigation';

export default function HomePage(){
  const [fileA, setFileA] = useState<File|null>(null);
  const [fileB, setFileB] = useState<File|null>(null);
  const [sameVideo, setSameVideo] = useState(false);
  const [oneFile, setOneFile] = useState<File|null>(null);
  const [startA, setStartA] = useState(0);
  const [endA, setEndA] = useState(0);
  const [startB, setStartB] = useState(0);
  const [endB, setEndB] = useState(0);
  const [uploadedSingle, setUploadedSingle] = useState<{bucket:string; key:string} | null>(null);
  const [status, setStatus] = useState<string>('');
  const [lastError, setLastError] = useState<string>('');
  const router = useRouter();

  async function onSubmit(e: React.FormEvent){
    e.preventDefault();
    setLastError('');
    try{
      if(!sameVideo){
        if(!fileA || !fileB){ alert('Please choose both Lap A and Lap B videos.'); return; }
        setStatus('Uploading Lap A');
        const a = await signUpload(fileA.name, fileA.type || "video/mp4");
        await putToB2(a.put_url, fileA, fileA.type||"video/mp4");
        setStatus('Uploading Lap B');
        const b = await signUpload(fileB.name, fileB.type || "video/mp4");
        await putToB2(b.put_url, fileB, fileB.type||"video/mp4");
        setStatus('Starting job');
        const job = await startModalJob({ mode:"pair", lapA:{bucket:a.bucket,key:a.key}, lapB:{bucket:b.bucket,key:b.key} });
        await poll(job.call_id);
      }else{
        if(!oneFile){ alert('Please choose a video containing both laps.'); return; }
        setStatus('Uploading single video');
        let u = uploadedSingle;
        if(!u){
          const s = await signUpload(oneFile.name, oneFile.type || 'video/mp4');
          await putToB2(s.put_url, oneFile, oneFile.type||'video/mp4');
          u = {bucket:s.bucket,key:s.key}; setUploadedSingle(u);
        }
        setStatus('Starting job');
        const job = await startModalJob({ mode:'segments', video:u, segA:{start:startA,end:endA}, segB:{start:startB,end:endB} });
        await poll(job.call_id);
      }
    }catch(err:any){
      console.error(err);
      const msg = err?.message || String(err);
      setLastError(msg); setStatus('');
      alert(`Error: ${msg}`);
    }
  }

  async function poll(callId: string){
    setStatus('Processing');
    let done=false, manifest:any=null;
    while(!done){
      const j = await pollJob(callId);
      if(j.status === 'finished'){ done=true; manifest=j.result; break; }
      if(j.status === 'failed'){ throw new Error('Server reported failure'); }
      await new Promise(r=>setTimeout(r, 1500));
    }
    if(manifest){
      sessionStorage.setItem('manifest', JSON.stringify(manifest));
      setStatus('Done'); router.push('/results');
    }
  }

  async function onAutoDetect(){
    setLastError('');
    try{
      if(!oneFile){ alert('Choose a video first.'); return; }
      let up = uploadedSingle;
      if(!up){
        setStatus('Uploading'); const s = await signUpload(oneFile.name, oneFile.type || 'video/mp4');
        await putToB2(s.put_url, oneFile, oneFile.type || 'video/mp4');
        up = { bucket: s.bucket, key: s.key }; setUploadedSingle(up);
      }
      setStatus('Detecting laps');
      const res = await detectLaps(up);
      const a = res.laps?.[0]; const b = res.laps?.[1];
      if(a){ setStartA(Number(a.start_s.toFixed(2))); setEndA(Number(a.end_s.toFixed(2))); }
      if(b){ setStartB(Number(b.start_s.toFixed(2))); setEndB(Number(b.end_s.toFixed(2))); }
      if(!a && !b){ alert('No laps detected.'); }
      setStatus('');
    }catch(err:any){
      console.error(err);
      const msg = err?.message || String(err);
      setLastError(msg); setStatus('');
      alert(`Auto-detect failed: ${msg}`);
    }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Lap Compare (Vision-Only) — Cloud</h1>
      <div className="rounded border p-3 text-sm">
        <div><b>Control plane URL:</b> {CONTROL_PLANE || <i>not set (check Vercel env)</i>}</div>
        {lastError && <div className="text-red-600 mt-2 break-words"><b>Error:</b> {lastError}</div>}
        {status && <div className="text-gray-700 mt-2"><b>Status:</b> {status}</div>}
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <input id="same" type="checkbox" checked={sameVideo} onChange={e=>setSameVideo(e.target.checked)} />
          <label htmlFor="same">Compare two laps from the same video</label>
        </div>
        {!sameVideo && (<>
          <div><label className="block text-sm mb-1">Lap A (reference)</label><input type="file" accept="video/*" onChange={e=>setFileA(e.target.files?.[0] || null)} /></div>
          <div><label className="block text-sm mb-1">Lap B (compare)</label><input type="file" accept="video/*" onChange={e=>setFileB(e.target.files?.[0] || null)} /></div>
        </>)}
        {sameVideo && (<>
          <div><label className="block text-sm mb-1">Video containing both laps</label><input type="file" accept="video/*" onChange={e=>setOneFile(e.target.files?.[0] || null)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm">Lap A start (s)</label><input type="number" step="0.1" value={startA} onChange={e=>setStartA(parseFloat(e.target.value))} className="border px-2 py-1 rounded w-full"/></div>
            <div><label className="block text-sm">Lap A end (s, 0 = end)</label><input type="number" step="0.1" value={endA} onChange={e=>setEndA(parseFloat(e.target.value))} className="border px-2 py-1 rounded w-full"/></div>
            <div><label className="block text-sm">Lap B start (s)</label><input type="number" step="0.1" value={startB} onChange={e=>setStartB(parseFloat(e.target.value))} className="border px-2 py-1 rounded w-full"/></div>
            <div><label className="block text-sm">Lap B end (s, 0 = end)</label><input type="number" step="0.1" value={endB} onChange={e=>setEndB(parseFloat(e.target.value))} className="border px-2 py-1 rounded w-full"/></div>
          </div>
          <div className="border rounded p-3 space-y-2">
            <button type="button" className="px-3 py-1 rounded bg-gray-800 text-white" onClick={onAutoDetect}>Auto-detect laps</button>
          </div>
        </>)}
        <button className="px-4 py-2 rounded bg-black text-white" type="submit">Upload & Analyze</button>
      </form>
    </main>
  )
}