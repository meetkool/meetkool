// One short online session on the public server, recorded from inside the page.
const { chromium } = require('playwright');
const fs=require('fs');const OUT=process.argv[2];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const status=[];let stop=false;
 (async()=>{while(!stop){try{const r=await fetch('https://mantarjantar.com/status',{cache:'no-store'});status.push({t:Date.now(),s:await r.json()});}catch(e){status.push({t:Date.now(),err:String(e)});}await sleep(10000);}})();
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const frames=[];const t0=Date.now();const errs=[];
 p.on('pageerror',e=>errs.push(String(e)));
 p.on('websocket',ws=>{frames.push({t:Date.now()-t0,dir:'open',url:ws.url()});
  ws.on('framesent',f=>{let k='?';try{k=JSON.parse(f.payload).t}catch(e){}frames.push({t:Date.now()-t0,dir:'out',k,n:Buffer.byteLength(f.payload)})});
  ws.on('framereceived',f=>{const bin=typeof f.payload!=='string';let k='bin';if(!bin){try{k=JSON.parse(f.payload).t}catch(e){}}frames.push({t:Date.now()-t0,dir:'in',k,n:bin?f.payload.length:Buffer.byteLength(f.payload),key:bin?(f.payload[0]&1):undefined})});
  ws.on('close',()=>frames.push({t:Date.now()-t0,dir:'close'}));});
 await p.goto('https://mantarjantar.com/',{waitUntil:'load'});
 await sleep(2500);
 await p.fill('#name','Observer');
 await p.evaluate(()=>{document.querySelector('.role[data-r=P]').click();});
 await p.click('#play');
 await p.waitForFunction(()=>window.__jm&&window.__jm.S.me,null,{timeout:30000});
 // in-page recorder at 5 Hz
 await p.evaluate(()=>{const j=window.__jm;window.__rec=[];const t0=performance.now();
  window.__recT=setInterval(()=>{const S=j.S,sn=S.snaps[S.snaps.length-1];if(!sn||!S.me)return;
   window.__rec.push({t:Math.round(performance.now()-t0),tk:sn.tk,ping:S.ping,delay:+(S.delay||0).toFixed(2),
    me:{x:S.me.x,y:S.me.y,st:S.me.st,team:S.me.team,sc:S.me.sc,k:S.me.k,ack:S.me.ack,ctx:S.me.ctx,cd:S.me.cd,wl:S.me.wl},
    pred:{x:+j.P.x.toFixed(1),y:+j.P.y.toFixed(1),ox:+j.P.ox.toFixed(1),oy:+j.P.oy.toFixed(1)},
    rd:S.rd,ents:[...sn.ents.values()].map(e=>[e[0],e[1],e[2],e[3],e[5],e[11]]),cans:[...sn.cans.values()],
    bus:[...sn.buses.values()].length,lb:S.lb});},200);});
 const toward=async(tx,ty)=>{const st=await p.evaluate(()=>({x:window.__jm.P.x,y:window.__jm.P.y}));const dx=tx-st.x,dy=ty-st.y;
  for(const k of['KeyW','KeyA','KeyS','KeyD'])await p.keyboard.up(k);
  if(Math.abs(dx)>40)await p.keyboard.down(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>40)await p.keyboard.down(dy>0?'KeyS':'KeyW');};
 // phase 1: protester, 60 s
 for(let i=0;i<60;i++){await toward(3300,2950);if(i%2===0)await p.keyboard.press('Space');await sleep(1000);
  if(i===30)await p.screenshot({path:OUT+'/live-protester.png'});}
 for(const k of['KeyW','KeyA','KeyS','KeyD'])await p.keyboard.up(k);
 // phase 2: police, 45 s
 await p.keyboard.press('KeyT');
 await p.waitForFunction(()=>window.__jm.S.me&&window.__jm.S.me.team==='C',null,{timeout:15000}).catch(()=>{});
 for(let i=0;i<45;i++){
  const tgt=await p.evaluate(()=>{const j=window.__jm,S=j.S,sn=S.snaps[S.snaps.length-1];if(!sn)return null;let best=null,bd=1e12;
   for(const e of sn.ents.values()){if(e[1]!==0||(e[5]&4096))continue;const d=(e[2]-j.P.x)**2+(e[3]-j.P.y)**2;if(d<bd){bd=d;best=e;}}
   if(!best)return null;const W=innerWidth,H=innerHeight;return{x:best[2],y:best[3],sx:W/2+(best[2]-j.cam.x)*j.cam.z,sy:H/2+(best[3]-j.cam.y)*j.cam.z,d:Math.sqrt(bd)};});
  if(tgt){await toward(tgt.x,tgt.y);const sx=Math.max(5,Math.min(1275,tgt.sx)),sy=Math.max(5,Math.min(795,tgt.sy));
   await p.mouse.click(sx,sy);if(i%5===0)await p.mouse.click(sx,sy,{button:'right'});}
  else await toward(3300,2950);
  await sleep(1000);if(i===25)await p.screenshot({path:OUT+'/live-police.png'});}
 const rec=await p.evaluate(()=>{clearInterval(window.__recT);return window.__rec;});
 await p.evaluate(()=>window.__jm.showMenu());await sleep(1500);
 await b.close();stop=true;await sleep(200);
 fs.writeFileSync(OUT+'/online.json',JSON.stringify({frames,rec,status,errs}));
 console.log('frames',frames.length,'samples',rec.length,'status',status.length,'errors',errs.length);
})().catch(e=>{console.error(e);process.exit(1)});
