const { chromium, devices } = require('playwright');const fs=require('fs');const OUT=process.argv[2];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({...devices['Pixel 7']});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.goto('http://127.0.0.1:8765/');await sleep(800);
 await p.fill('#name','Phone Probe');await p.tap('#practice');await sleep(2500);
 const cdp=await ctx.newCDPSession(p);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 const pos=()=>p.evaluate(()=>({x:+window.__jm.P.x.toFixed(1),y:+window.__jm.P.y.toFixed(1),btn:getComputedStyle(document.getElementById('mob')).display,act:document.getElementById('bAct').textContent}));
 const log=[];log.push({t:'start',...await pos()});
 // drag joystick: start at (120,600), pull right+up 60px, hold 3 s
 await touch('touchStart',120,600);await touch('touchMove',150,590);await touch('touchMove',180,570);
 for(let i=0;i<6;i++){await sleep(500);log.push({t:'hold'+i,...await pos()});}
 await p.screenshot({path:OUT+'/phone.png'});
 await touch('touchEnd');await sleep(600);log.push({t:'released',...await pos()});
 await p.tap('#bAct');await sleep(300);log.push({t:'tapAct',...await pos(),toasts:await p.evaluate(()=>window.__jm.S.me&&window.__jm.S.me.k)});
 fs.writeFileSync(OUT+'/phone.json',JSON.stringify({log,errs}));console.log(JSON.stringify({log,errs}));await b.close();
})();
