import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {newState,newPiece,STATIONS} from '../src/simulation/model.ts';
const prefix=process.env.QA_PREFIX||'cursor-work-r38';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`qa/${prefix}-video`,size:{width:1440,height:900}}});
const page=await context.newPage(),errors=[],samples=[],checks=[],handRequests=[];
page.on('request',r=>{if(/\/assets\/(user-(left|right)-hand|hands\.|hand-rig)/.test(r.url()))handRequests.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
const inspect=()=>page.evaluate(()=>({view:window.__YAOHUO__.view(),state:window.__YAOHUO__.snapshot()}));
try{
 await page.goto(process.env.QA_URL||'http://127.0.0.1:5190/');await page.waitForFunction(()=>window.__YAOHUO__,null,{timeout:120000});await page.locator('#start').click();
 for(const station of ['clay','wheel','paint','glaze']){
  const state=newState(),p=newPiece('bowl',1),s=STATIONS.find(s=>s.id===station);
  Object.assign(p,{height:.19,radius:Array(48).fill(.10),location:station,position:s.pos,stage:station==='clay'?'raw':station==='wheel'?'thrown':'trimmed',opened:station!=='clay',moisture:station==='paint'?.25:.7,preparation:station==='clay'?0:1});
  state.pieces=[p];state.activeId=p.id;state.player=s.approach;
  await page.locator('[data-act="settings"]').click();const download=page.waitForEvent('download');await page.locator('#import').setInputFiles({name:'cursor-work.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await download;
  await page.waitForFunction(()=>window.__YAOHUO__.view().modal==='');await page.keyboard.press('KeyE');await page.waitForTimeout(3000);
  const before=await inspect();samples.push({station,phase:'before',...before});
  const contact=await page.evaluate(()=>{const d=window.__YAOHUO__,b=d.view().pieceBounds;for(const v of [.6,.45,.7])for(const u of [.5,.4,.6]){const x=b.x+b.w*u,y=b.y+b.h*v;if(d.hitPiece(x,y)&&document.elementFromPoint(x,y)?.tagName==='CANVAS')return{x,y};}return null;});
  assert(contact,station+' visible interactive clay');
  if(station==='wheel')await page.keyboard.down('Space');
  await page.mouse.move(contact.x,contact.y);await page.mouse.down();
  for(let stroke=0;stroke<4;stroke++){
   const x=contact.x+(stroke%2?-.035:.035)*before.view.pieceBounds.w;
   const y=station==='glaze'?contact.y+Math.min(170,stroke*50):contact.y+(stroke%2?-.18:.05)*before.view.pieceBounds.h;
   await page.mouse.move(x,y,{steps:24});await page.waitForTimeout(250);
   samples.push({station,phase:'stroke-'+stroke,...await inspect()});
   if(stroke===2)await page.screenshot({path:`qa/${prefix}-${station}-working.png`});
  }
  await page.mouse.up();await page.keyboard.up('Space');await page.waitForTimeout(900);const after=await inspect();samples.push({station,phase:'release',...after});
  await page.screenshot({path:`qa/${prefix}-${station}-released.png`});
  checks.push({name:station+' uses unlocked standard cursor',passed:after.view.interaction.mode==='cursor'&&!after.view.interaction.pointerLocked&&['default','pointer'].includes(after.view.interaction.cursor)});
  if(station==='clay')checks.push({name:'kneading changes clay preparation',passed:after.state.pieces[0].preparation>before.state.pieces[0].preparation});
  if(station==='wheel')checks.push({name:'real pulling changes vessel geometry',passed:after.state.pieces[0].height!==before.state.pieces[0].height||after.state.pieces[0].radius.some((v,i)=>v!==before.state.pieces[0].radius[i])});
  if(station==='paint')checks.push({name:'real brush strokes create marks',passed:after.state.pieces[0].marks.length>before.state.pieces[0].marks.length});
  if(station==='glaze')checks.push({name:'dragging dips vessel into glaze',passed:samples.some(s=>s.station==='glaze'&&s.phase.startsWith('stroke')&&s.view.glazeContact.immersed>before.view.glazeContact.immersed)});
  await page.keyboard.press('Escape');
  checks.push({name:station+' exits to walking',passed:(await inspect()).view.interaction.mode==='walk'});
 }
 for(const station of ['supply','rack','kiln','display']) {
  const state=newState(),s=STATIONS.find(s=>s.id===station);state.player=s.approach;
  await page.locator('[data-act="settings"]').click();const download=page.waitForEvent('download');await page.locator('#import').setInputFiles({name:'cursor-station.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await download;
  await page.keyboard.press('KeyE');await page.waitForTimeout(1600);
  const current=await inspect();samples.push({station,phase:'entered',...current});
  checks.push({name:station+' uses unlocked standard cursor',passed:current.view.focus===station&&current.view.interaction.mode==='cursor'&&!current.view.interaction.pointerLocked&&current.view.interaction.cursor==='default'});
  await page.screenshot({path:`qa/${prefix}-${station}.png`});await page.keyboard.press('Escape');
 }
 const walkBefore=await inspect();await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');const walkAfter=await inspect();
 checks.push({name:'walking remains available between stations',passed:Math.hypot(walkAfter.state.player[0]-walkBefore.state.player[0],walkAfter.state.player[2]-walkBefore.state.player[2])>.1});
 checks.push({name:'no hand models or rigs requested',passed:handRequests.length===0});
}catch(e){errors.push(e.stack);process.exitCode=1;}
finally{await page.close();const video=await page.video().path();await context.close();await browser.close();await fs.writeFile(`qa/${prefix}.json`,JSON.stringify({errors,checks,handRequests,samples,video},null,2));console.log(JSON.stringify({errors,checks,video},null,2));}
if(errors.length||checks.some(c=>!c.passed))process.exitCode=1;
