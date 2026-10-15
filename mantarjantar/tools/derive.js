const D=require(process.argv[2]);const F=D.frames,R=D.rec;const out={};
const t0=F.find(f=>f.dir==='open').t;
// per-second traffic
const sec={};for(const f of F){if(f.n===undefined)continue;const s=Math.floor((f.t-t0)/1000);sec[s]=sec[s]||{i:0,o:0,ni:0,no:0};if(f.dir==='in'){sec[s].i+=f.n;sec[s].ni++}else{sec[s].o+=f.n;sec[s].no++}}
const S=Object.keys(sec).map(Number).sort((a,b)=>a-b);out.traffic=S.map(s=>[s,sec[s].i,sec[s].o,sec[s].ni,sec[s].no]);
const bin=F.filter(f=>f.k==='bin'&&!f.key).map(f=>f.n).sort((a,b)=>a-b);
const hist=[0,0,0,0,0,0,0,0];const edges=[100,200,300,400,600,800,1200,1e9];for(const n of bin)hist[edges.findIndex(e=>n<e)]++;out.snapHist={edges,hist};
// recorder timeline: map rec t to ws t approx (rec starts later); use sample index * 200ms
out.ping=R.filter((r,i)=>i%5===0).map(r=>[r.t,r.ping,r.delay]);
out.me=R.map(r=>[r.t,Math.round(r.me.x),Math.round(r.me.y),r.me.team,r.me.st,r.me.sc,r.me.k]);
// classify & speeds
const cls=e=>{const [id,ty,x,y,fl]=e;if(ty===2)return'media';if(ty===1)return'police';if(fl&256)return'human';if(fl&512)return'bot';if(fl&(128|262144))return'detained';if(fl&4096)return'idle';if(fl&131072)return'scared';if(fl&16)return'sitting';return'crowd';};
const sp={};for(let i=1;i<R.length;i++){const a=new Map(R[i-1].ents.map(e=>[e[0],e]));const dt=(R[i].t-R[i-1].t)/1000;if(dt<=0||dt>.5)continue;for(const e of R[i].ents){const p=a.get(e[0]);if(!p)continue;const c=cls(e);if(c==='detained')continue;const v=Math.hypot(e[2]-p[2],e[3]-p[3])/dt;if(v>600)continue;(sp[c]=sp[c]||[]).push(v);}}
out.speed=Object.fromEntries(Object.entries(sp).map(([k,a])=>{a.sort((x,y)=>x-y);const q=f=>Math.round(a[Math.min(a.length-1,a.length*f|0)]);const mv=a.filter(v=>v>20);mv.sort((x,y)=>x-y);return[k,{n:a.length,moving:+(mv.length/a.length).toFixed(2),p50m:mv.length?Math.round(mv[mv.length/2|0]):0,p90m:mv.length?Math.round(mv[mv.length*.9|0]):0}]}));
// traces: protester phase window 20s (samples 100..200) and police window
const win=(a,b)=>{const tr={};for(const r of R.slice(a,b))for(const e of r.ents){const c=cls(e);(tr[e[0]]=tr[e[0]]||{c,p:[]}).p.push([e[2],e[3]]);}const meP=R.slice(a,b).map(r=>[Math.round(r.pred.x),Math.round(r.pred.y)]);return{tr:Object.values(tr).filter(t=>t.p.length>3).map(t=>({c:t.c,p:t.p.filter((q,i)=>i%2===0)})),me:meP}};
const firstC=R.findIndex(r=>r.me.team==='C'&&r.me.st==='active');
out.winP=win(2,78);out.winC=win(firstC+20,firstC+120);
// cans: radius growth per can id over time
const cans={};R.forEach(r=>{for(const c of r.cans){(cans[c[0]]=cans[c[0]]||[]).push([r.t,c[3],c[4],c[5]]);}});
out.cans=Object.values(cans).filter(a=>a.length>10).slice(0,12).map(a=>a.map(([t,h,rr,k])=>[t-a[0][0],h,rr,k]));
out.canCount=Object.keys(cans).length;
// class counts in view median
const cc={};for(const r of R){const m={};for(const e of r.ents){const c=cls(e);m[c]=(m[c]||0)+1}for(const k in m)(cc[k]=cc[k]||[]).push(m[k]);}
out.inView=Object.fromEntries(Object.entries(cc).map(([k,a])=>{a.sort((x,y)=>x-y);return[k,a[a.length/2|0]]}));
out.status=D.status.filter(s=>s.s).map(s=>({t:s.t,players:s.s.players,rooms:s.s.list.map(r=>[r.id,r.humans,r.P,r.C,r.ents,r.round])}));
out.summary={wsSeconds:+((F[F.length-1].t-t0)/1000).toFixed(1),inputs:F.filter(f=>f.k==='in').length,snaps:F.filter(f=>f.k==='bin').length,keyframes:F.filter(f=>f.key===1).length,inKB:+(F.filter(f=>f.dir==='in'&&f.n).reduce((s,f)=>s+f.n,0)/1024).toFixed(1),outKB:+(F.filter(f=>f.dir==='out'&&f.n).reduce((s,f)=>s+f.n,0)/1024).toFixed(1),snapMedian:bin[bin.length>>1],snapMax:bin[bin.length-1],welcome:2428,keyframe:1975,unique:new Set(R.flatMap(r=>r.ents.map(e=>e[0]))).size,humans:new Set(R.flatMap(r=>r.ents.filter(e=>e[4]&256).map(e=>e[0]))).size,round:R[0].rd[7],target:R[0].rd[2],firstC};
require('fs').writeFileSync(process.argv[3],JSON.stringify(out));
console.log(JSON.stringify({speed:out.speed,inView:out.inView,summary:out.summary,canCount:out.canCount,snapHist:out.snapHist,tracesP:out.winP.tr.length,tracesC:out.winC.tr.length,cans0:out.cans[0]&&out.cans[0].slice(0,40).map(x=>x.join(':')).join(' ')}));
console.log(JSON.stringify(out.status[out.status.length-1]));
