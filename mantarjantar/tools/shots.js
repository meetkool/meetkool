const { chromium } = require('playwright');
const OUT=process.argv[2];
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(()=>chromium.launch());
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
 await p.waitForTimeout(800);await p.screenshot({path:OUT+'/01-menu.png'});
 await p.fill('#name','REA Probe');
 await p.click('#practice');
 await p.waitForTimeout(2500);await p.screenshot({path:OUT+'/02-protester-spawn.png'});
 // walk toward Jantar Mantar with keyboard for ~25s, clicking to rally
 for(let i=0;i<25;i++){
  const st=await p.evaluate(()=>{const j=window.__jm;return {x:j.P.x,y:j.P.y};});
  const dx=3300-st.x,dy=2950-st.y;
  for(const k of ['KeyW','KeyA','KeyS','KeyD'])await p.keyboard.up(k);
  if(Math.abs(dx)>40)await p.keyboard.down(dx>0?'KeyD':'KeyA');
  if(Math.abs(dy)>40)await p.keyboard.down(dy>0?'KeyS':'KeyW');
  await p.keyboard.press('Space');await p.waitForTimeout(1000);
  if(i===12)await p.screenshot({path:OUT+'/03-protester-marching.png'});
 }
 await p.screenshot({path:OUT+'/04-protester-later.png'});
 const me=await p.evaluate(()=>{const m=window.__jm.S.me;return m&&{st:m.st,sc:m.sc,k:m.k,best:m.best,wl:m.wl,ctx:m.ctx,mis:m.mis};});
 // switch to police
 await p.keyboard.press('KeyT');await p.waitForTimeout(3000);
 await p.mouse.move(800,400);await p.mouse.down();await p.mouse.up();
 await p.mouse.click(900,350,{button:'right'});await p.waitForTimeout(1500);
 await p.screenshot({path:OUT+'/05-police.png'});
 const me2=await p.evaluate(()=>{const m=window.__jm.S.me;return m&&{team:m.team,st:m.st,cd:m.cd,mis:m.mis};});
 console.log(JSON.stringify({protester:me,police:me2,errors:errs}));
 await b.close();
})();
