'use client'
import React, { useEffect, useState } from 'react';
import DeltaChart from '../../components/DeltaChart';

export default function ResultsPage(){
  const [manifest, setManifest] = useState<any>(null);

  useEffect(()=>{
    const m = sessionStorage.getItem('manifest');
    if(m) setManifest(JSON.parse(m));
  },[]);

  if(!manifest) return <main className="p-6 max-w-4xl mx-auto">No results yet.</main>;

  const overlay = manifest.artifacts?.["overlay.mp4"]?.url;
  const metrics = manifest.artifacts?.["metrics.csv"]?.url;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Results — {manifest.job_id}</h1>
      <p className="text-gray-700">{manifest.summary}</p>

      {overlay && (<section><h2 className="text-lg font-medium mb-2">Overlay</h2><video controls className="w-full rounded" src={overlay} /></section>)}

      {metrics && (<section><h2 className="text-lg font-medium mb-2">Downloads</h2><a className="underline" href={metrics} target="_blank" rel="noreferrer">metrics.csv</a></section>)}
    </main>
  )
}
