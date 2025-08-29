'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
export default function DeltaChart({ data }:{ data: { distance:number; deltaT:number }[] }){
  return (<div style={{ width: '100%', height: 300 }}>
    <ResponsiveContainer>
      <LineChart data={data}>
        <XAxis dataKey="distance"/><YAxis/><Tooltip/>
        <Line type="monotone" dataKey="deltaT" dot={false}/>
      </LineChart>
    </ResponsiveContainer>
  </div>);
}
