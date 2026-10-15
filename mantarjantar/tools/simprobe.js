// Headless probe: run the shipped authoritative sim in Node, no network.
const path=process.argv[2];
const W=require(path+'/shared/world.js'), Sim=require(path+'/shared/sim.js');
console.log('world: roads',W.ROADS.length,'buildings',W.BUILD.length,'trees',W.TREES.length,'gates',W.GATE_DEFS.length,W.GATE_DEFS.map(g=>g.name+'('+g.road+')').join(','),
 '\ncheckpoints',W.CHECKS.length,'stalls',W.STALLS.length,W.STALLS.map(s=>s.type).join(','),'sites',W.SITES.length,'cctv',W.CCTV.length,'hides',W.HIDES.length,'doors',W.DOORS.length,'metro',W.METRO.length);
const sim=Sim.createSim();
const me=sim.addPlayer('Probe','P',false,0);
const t0=Date.now();
const seen={fx:{},pf:{}};let cl={fxTick:0};
for(let i=0;i<30*300;i++){ // 5 game-minutes
  // walk toward Jantar Mantar
  const dx=3300-me.x,dy=2950-me.y,m=Math.hypot(dx,dy)||1;
  sim.input(me.id,{s:i,x:dx/m,y:dy/m,a:i%45===0?1:0,e:0,g:0,q:-1,ff:0,f:0,r:0});
  sim.step();
  for(const f of sim.S.fx) if(f.t===sim.S.tick) seen.fx[f.k]=(seen.fx[f.k]||0)+1;
  if(i%30===0){const s=sim.snapshot(me.id,{w:1200,h:900},cl);if(s.pf)for(const p of s.pf)seen.pf[p[0]]=(seen.pf[p[0]]||0)+1;}
}
const S=sim.S;
console.log('ran',S.tick,'ticks in',Date.now()-t0,'ms; stats',JSON.stringify(sim.stats()));
console.log('pockets',sim.staticInfo().pockets.length,'buses',S.buses.length,'cannons',S.cannons.length,'bars',S.bars.length,'media',S.media.length);
const roles={};for(const e of S.ents){const k=e.team+':'+(e.role||e.mode)+':'+e.ctl;roles[k]=(roles[k]||0)+1;}console.log('entity mix',JSON.stringify(roles));
console.log('round',JSON.stringify({num:S.round.num,t:Math.round(S.round.t),meter:Math.round(S.round.meter),target:S.round.target,det:S.round.det,arr:S.round.arr}),'tally',JSON.stringify(S.tally));
console.log('probe player',JSON.stringify({x:Math.round(me.x),y:Math.round(me.y),state:me.state,score:Math.round(me.score),k:me.followers.length,stats:me.stats}));
console.log('fx kinds seen',JSON.stringify(seen.fx));console.log('private fx seen',JSON.stringify(seen.pf));
const js=sim.snapshotJSON(me.id,{w:1200,h:900},null);console.log('snapshot JSON bytes',js.length,'keys',Object.keys(JSON.parse(js)).join(','));
