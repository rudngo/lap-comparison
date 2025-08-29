'use client'
import React, { useState, useEffect } from 'react';
import { signUpload, putToB2, startModalJob, pollJob } from '../lib/api';
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
  const [status, setStatus] = useState<string>('');
  const router = useRouter();

  async function onSubmit(e: React.FormEvent){
    e.preventDefault();
    setStatus('uploading');
    if(!sameVideo){
      if(!fileA || !fileB) return;
      const a = await signUpload(fileA.name, fileA.type || "video/mp4"); await putToB2(a.put_url, fileA, fileA.type||"video/mp4");
      const b = await signUpload(fileB.name, fileB.type || "video/mp4"); await putToB2(b.put_url, fileB, fileB.type||"video/mp4");
      setStatus('starting job');
      const job = await startModalJob({ mode:"pair", lapA:{bucket:a.bucket,key:a.key}, lapB:{bucket:b.bucket,key:b.key} });
      await poll(job.call_id);
    }else{
      if(!oneFile) return;
      const s = await signUpload(oneFile.name, oneFile.type || "video/mp4"); await putToB2(s.put_url, oneFile, oneFile.type||"video/mp4");
      setStatus('starting job');
      const job = await startModalJob({ mode:"segments", video:{bucket:s.bucket,key:s.key}, segA:{start:startA,end:endA}, segB:{start:startB,end:endB} });
      await poll(job.call_id);
    }
  }

  async function poll(callId: string){
    setStatus('processing');
    let done=false, manifest:any=null;
    while(!done){
      const j = await pollJob(callId);
      if(j.status === 'finished'){ done=true; manifest=j.result; break; }
      if(j.status === 'failed'){ setStatus('failed'); return; }
      await new Promise(r=>setTimeout(r, 2000));
    }
    if(manifest){
      sessionStorage.setItem('manifest', JSON.stringify(manifest));
      router.push('/results');
    }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Lap Compare (Vision-Only) — Cloud</h1>
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
        </>)}

        <button className="px-4 py-2 rounded bg-black text-white" type="submit">Upload & Analyze</button>
      </form>

      {status && (<div className="mt-6 text-sm text-gray-600">Status: {status}</div>)}
    </main>
  )
}
