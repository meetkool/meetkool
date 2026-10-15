const d=require(process.argv[2]);const W=require(process.argv[3]+'/shared/world.js');
const bbox=w=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const t of w.tr)for(const[x,y]of t.p){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 for(const[x,y]of w.me){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}const m=60;return[x0-m,y0-m,x1+m,y1+m].map(Math.round)};
const win=w=>{const me=[];for(const q of w.me){const l=me[me.length-1];if(l&&Math.hypot(q[0]-l[0],q[1]-l[1])>300)me.length=0;me.push(q);}w.me=me;{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[x,y]of me){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}const M=750;w.tr=w.tr.map(t=>({c:t.c,p:t.p.filter(([x,y])=>x>x0-M&&x<x1+M&&y>y0-M&&y<y1+M)})).filter(t=>t.p.length>3);}const b=bbox(w);return{b,tr:w.tr.map(t=>({c:t.c,p:t.p.map(([x,y])=>[x,y])})),me:w.me,bld:W.BUILD.filter(q=>q.x+q.w>b[0]&&q.x<b[2]&&q.y+q.h>b[1]&&q.y<b[3]).map(q=>[q.x,q.y,q.w,q.h].map(Math.round)),
 roads:W.ROADS.map(r=>({w:r.w,p:r.p})).filter(r=>r.p.some(([x,y])=>x>b[0]-800&&x<b[2]+800&&y>b[1]-800&&y<b[3]+800)),
 rings:W.RINGS.filter(g=>Math.abs(g.x-(b[0]+b[2])/2)<g.r+2000),zone:W.ZONE}};
// my state timeline
const seg=[];for(const r of d.me){const k=r[3]+':'+r[4];if(!seg.length||seg[seg.length-1].k!==k)seg.push({k,a:r[0],b:r[0]});else seg[seg.length-1].b=r[0];}
// gas formula curves (from sim.js): flight T=0.35+d/850; radius = R*min(1,age/1.1)*fade, life 7, fade over last 1.5s
const gas=[];for(let a=0;a<=7.001;a+=0.1){const g=Math.min(1,a/1.1),f=a>5.5?Math.max(0,(7-a)/1.5):1;gas.push([+a.toFixed(1),+(150*g*f).toFixed(1),+(115*g*f).toFixed(1)]);}
const arc=[];const D=400,T=0.35+D/850;for(let t=0;t<=T+1e-9;t+=T/30){const k=Math.min(1,t/T);arc.push([+(k*D).toFixed(1),+(30+Math.sin(k*Math.PI)*(40+D*0.12)-30*k).toFixed(1)]);}
const out={traffic:d.traffic,snapHist:d.snapHist,ping:d.ping,seg,speed:d.speed,inView:d.inView,status:d.status.map(s=>({t:s.t,players:s.players,rooms:s.rooms})),winP:win(d.winP),winC:win(d.winC),gas,arc,arcT:+T.toFixed(3),canCount:d.canCount,canR:d.cans.map(a=>Math.max(...a.map(x=>x[2]))),summary:d.summary};
require('fs').writeFileSync(process.argv[4],'window.LIVE='+JSON.stringify(out)+';');
console.log(JSON.stringify(seg),out.winP.b,out.winC.b,out.winP.bld.length,out.winC.bld.length);
