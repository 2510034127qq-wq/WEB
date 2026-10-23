import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { chromium } from '@playwright/test';

// A fresh, empty browser. No imported stage fixtures or writable diagnostics.
// Projection and ray queries only locate visible surfaces for real input.
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const prefix=process.env.QA_PREFIX||'craft-chain-r13';
const out=`qa/exports/${prefix}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,downloadsPath:'.tmp/playwright-downloads'});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],failedRequests=[],steps=[],completed=[],exports=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()}));
page.on('response',r=>{if(r.status()>=400)failedRequests.push({url:r.url(),status:r.status()});});
const read=()=>page.evaluate(()=>window.__YAOHUO__.snapshot());
const view=()=>page.evaluate(()=>window.__YAOHUO__.view());
const piece=async()=>{const s=await read();return s.pieces.find(p=>p.id===s.activeId);};
const sleep=ms=>page.waitForTimeout(ms);
const act=name=>page.locator(`[data-act="${name}"]`).click();
const shot=name=>page.screenshot({path:`qa/${prefix}-${name}.png`});
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const log=(name,detail={})=>{steps.push({name,at:new Date().toISOString(),detail});console.log('PASS',name,JSON.stringify(detail));};
async function ready(){await page.waitForFunction(()=>window.__YAOHUO__,null,{timeout:120000});}
async function travel(id){
  if((await view()).focus)await page.keyboard.press('Escape');
  if((await view()).modal)await act('close-modal');
  await act('map');await act('go-'+id);
  await page.waitForFunction(()=>window.__YAOHUO__.view().nav===0,null,{timeout:60000});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(id=>window.__YAOHUO__.view().focus===id,id,{timeout:10000});
  await sleep(1300);
  assert.equal(await page.locator('#work input[type="range"],#work [data-hold]').count(),0);
}
async function take(){const id=(await piece()).id;await page.keyboard.press('KeyF');assert.equal((await read()).held,id);}
async function point(x=.58,y=.6){
  const b=(await view()).pieceBounds;assert(b&&b.w>0&&b.h>0,'visible piece bounds');
  return {x:b.x+b.w*x,y:b.y+b.h*y};
}
async function surface(u=.58,v=.6){
  const p=await point(u,v);
  const found=await page.evaluate(({p})=>{
    const d=window.__YAOHUO__;
    for(const dy of [0,-8,8,-16,16])for(const dx of [0,-6,6,-12,12]){
      const x=p.x+dx,y=p.y+dy,h=d.hitPiece(x,y);
      if(h&&h.surface==='outer')return {x,y,uv:h.uv};
    }
    return null;
  },{p});
  assert(found,'visible outer clay contact');return found;
}
async function drag(a,b,{steps=20,button='left',hold=0}={}){
  await page.mouse.move(a.x,a.y);await page.mouse.down({button});
  await page.mouse.move(b.x,b.y,{steps});if(hold)await sleep(hold);await page.mouse.up({button});
}
async function camera(){
  const v=await view(),c=new THREE.PerspectiveCamera(v.cameraFov,1440/900,.035,180);
  c.position.fromArray(v.camera);c.quaternion.fromArray(v.cameraQuaternion);c.updateMatrixWorld();return c;
}
const screen=(c,p)=>{const q=new THREE.Vector3(...p).project(c);return{x:(q.x+1)*720,y:(1-q.y)*450};};
async function worldDrag(a,b,plane=false){
  const c=await camera();
  if(plane){const p=new THREE.Plane().setFromNormalAndCoplanarPoint(c.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(...a));b=p.projectPoint(new THREE.Vector3(...b),new THREE.Vector3()).toArray();}
  const start=screen(c,a),end=screen(c,b);
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,start),'CANVAS','physical control is not covered by HUD');
  await drag(start,end,{steps:40});await sleep(150);
}
async function wheelTurn(){
  const c=await camera(),path=Array.from({length:25},(_,i)=>{const a=-.7+i*1.4/24;return screen(c,[Math.sin(a)*.39,.78,-5.6+Math.cos(a)*.39]);});
  await page.mouse.move(path[0].x,path[0].y);await page.mouse.down();
  for(const p of path.slice(1))await page.mouse.move(p.x,p.y);
  await page.mouse.up();await sleep(150);
  const status=await page.locator('#hand-status').innerText();
  assert(Number(status.match(/轮速\s+(\d+)/)?.[1])>0,'actual disc drag starts the wheel');
}
async function waitStage(stage,timeout=45000){
  await page.keyboard.down('KeyR');
  try{await page.waitForFunction(stage=>{const s=window.__YAOHUO__.snapshot();return s.pieces.find(p=>p.id===s.activeId)?.stage===stage;},stage,{timeout});}
  finally{await page.keyboard.up('KeyR');}
}
async function footRow(){
  return page.evaluate(()=>{
    const d=window.__YAOHUO__,b=d.view().pieceBounds,rows=[];
    for(let iy=50;iy<=98;iy++){
      const y=b.y+b.h*iy/100,hits=[];
      for(let ix=25;ix<=75;ix+=2){const x=b.x+b.w*ix/100,h=d.hitPiece(x,y);if(h?.surface==='outer'&&h.uv[1]>.015&&h.uv[1]<.20)hits.push(x);}
      if(hits.length>3)rows.push({y,left:Math.min(...hits),right:Math.max(...hits),n:hits.length});
    }
    return rows.sort((a,b)=>b.n-a.n)[0]||null;
  });
}
async function download(action,name){
  const pending=page.waitForEvent('download');await act(action);const d=await pending,path=`${out}/${name}`;
  try{await d.saveAs(path);}catch(error){throw new Error(`${action} download: ${await d.failure()} (${error.message})`);}
  const bytes=await fs.readFile(path);exports.push({action,path,bytes:bytes.length});return bytes;
}
async function saveConfirmed(){
  await act('save');
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='工坊已保存。',null,{timeout:15000});
}
let failure=null;
try{
  await page.goto(base);await ready();assert.equal((await read()).pieces.length,0,'fresh browser starts empty');await page.locator('#start').click();
  for(const form of (process.env.QA_FORMS||'bowl,vase').split(',')){
    await travel('supply');await page.keyboard.press(form==='bowl'?'Digit1':'Digit2');
    const clay=screen(await camera(),[-5.74,1.01,4.98]);await page.mouse.click(clay.x,clay.y);
    const initial=await piece();assert(initial&&initial.form===form&&initial.stage==='raw');assert.equal((await read()).held,initial.id);
    log(form+': take real clay billet',{id:initial.id});
    await travel('clay');
    const idle=(await piece()).preparation;await sleep(700);assert.equal((await piece()).preparation,idle);
    for(let i=0;i<38&&(await piece()).stage==='raw';i++){
      const b=(await view()).pieceBounds;
      await drag({x:b.x+b.w*.30,y:b.y+b.h*.57},{x:b.x+b.w*.72,y:b.y+b.h*.61});
      await drag({x:b.x+b.w*.70,y:b.y+b.h*.60},{x:b.x+b.w*.31,y:b.y+b.h*.56});
    }
    assert.equal((await piece()).stage,'prepared');log(form+': knead to prepared',{preparation:(await piece()).preparation});await shot(form+'-prepared');
    await take();await travel('wheel');await wheelTurn();
    for(let i=0;i<8&&!(await piece()).opened;i++){
      await page.keyboard.press('Space');const b=(await view()).pieceBounds;
      await drag({x:b.x+b.w*.5,y:b.y+b.h*.25},{x:b.x+b.w*.5,y:b.y+b.h*.78},{steps:28});
    }
    assert((await piece()).opened,'clay opens after contact strokes');
    const opened=await piece();
    for(let i=0;i<(form==='bowl'?14:12);i++){
      await page.keyboard.press('Space');const p=await surface(.59,form==='bowl'?.40:.63);
      await drag(p,{x:p.x+(form==='bowl'?22:8),y:p.y+(form==='bowl'?4:-27)},{steps:20});
    }
    if(form==='vase')for(let i=0;i<5;i++){await page.keyboard.press('Space');const p=await surface(.60,.37);await drag(p,{x:p.x-15,y:p.y-9});}
    const shaped=await piece();assert.notDeepEqual(shaped.radius,opened.radius);assert(shaped.wheelTraces?.length>0,'actual contact traces recorded');
    await page.keyboard.press('KeyB');const stopped=await piece(),p=await surface(.6,.62);await drag(p,{x:p.x+16,y:p.y});assert.deepEqual((await piece()).radius,stopped.radius);
    log(form+': real opening and shape',{height:shaped.height,maxRadius:Math.max(...shaped.radius),traces:shaped.wheelTraces.length});await shot(form+'-shaped');
    await take();await travel('rack');await waitStage('leather');await take();await travel('wheel');
    for(let i=0;i<7&&(await piece()).stage!=='trimmed';i++){
      await page.keyboard.press('Space');const p=await surface(.53,.53);await page.mouse.move(p.x,p.y);await page.mouse.down();await sleep(1100);await page.mouse.up();
    }
    assert.equal((await piece()).stage,'trimmed');assert.notDeepEqual((await piece()).thickness,shaped.thickness);log(form+': dry and trim',{trimmed:(await piece()).trimmed});
    await take();await travel('paint');
    for(let i=0;i<5;i++){const p=await surface(.44+i*.035,.60+i*.027);await drag(p,{x:p.x+24,y:p.y-9},{steps:18});}
    const painted=await piece();assert(painted.marks.length>10);log(form+': brush marks',{marks:painted.marks.length});await shot(form+'-painted');
    if(form==='bowl'){
      await act('settings');await saveConfirmed();await page.reload();await ready();
      assert.deepEqual((await piece()).marks,painted.marks);assert.deepEqual((await piece()).radius,painted.radius);assert.deepEqual((await piece()).wheelTraces,painted.wheelTraces);
      await page.locator('#start').click();await travel('paint');log('painted piece reload preserves shape, marks and wheel traces');
    }
    await take();await travel('glaze');
    const dip=await surface(.6,.55);await page.mouse.move(dip.x,dip.y);await page.mouse.down();await page.mouse.move(dip.x,dip.y+240,{steps:24});await sleep(3100);await shot(form+'-submerged');await page.mouse.move(dip.x,dip.y,{steps:24});await page.mouse.up();await sleep(900);
    assert(mean((await piece()).glaze)>.1,'immersion deposits glaze');const lifted=await piece();await sleep(650);assert.deepEqual((await piece()).glaze,lifted.glaze);
    const row=await footRow();assert(row,'outer foot reachable');
    await page.mouse.move(row.left+2,row.y);await page.mouse.down({button:'right'});
    for(let i=0;i<12&&!(await piece()).footClean;i++){await page.mouse.move(row.right-2,row.y,{steps:14});await page.mouse.move(row.left+2,row.y,{steps:14});}
    await page.mouse.up({button:'right'});assert((await piece()).footClean);log(form+': dip, lift and clean foot',{meanGlaze:mean((await piece()).glaze)});
    await take();await travel('rack');await waitStage('dry');await take();await travel('kiln');
    await worldDrag([6.95,.69,3.5],[6,1.05,3.8],true);assert.equal((await piece()).stage,'loaded');
    await worldDrag([5.18,.442,3.74],[6,.55,3.8],true);assert.equal((await read()).kiln.phase,'firing');
    await shot(form+'-kiln');await waitStage('fired',60000);assert(!(await piece()).defects.some(x=>x.startsWith('过火')));log(form+': physical kiln controls and cooled firing',{peak:(await piece()).peak,score:(await piece()).score});
    await take();await travel('display');await shot(form+'-fired');
    await page.locator('#work details summary').click();
    const glb=await download('export-glb',form+'.glb');assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(8),glb.length);
    const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)).trim());assert(json.images?.length&&json.meshes?.length);assert(json.nodes.some(n=>n.extras?.history?.length>5));
    const png=await download('photo',form+'.png');assert.equal(png.subarray(1,4).toString(),'PNG');
    await page.locator('#work details summary').click();
    await worldDrag([-.45,.97,5.65],[.18,1.11,5.8]);await sleep(700);assert.equal((await piece()).stage,'packed');
    const finished=await piece();assert.equal(finished.id,initial.id);assert.deepEqual(finished.marks,painted.marks);completed.push(finished);await shot(form+'-packed');log(form+': export and wrap',{id:finished.id,score:finished.score,defects:finished.defects});
  }
  if(completed.length>1){assert.notDeepEqual(completed[0].radius,completed[1].radius);assert.notEqual(completed[0].height,completed[1].height);}
  await act('settings');const backup=await download('backup','workshop.json');await saveConfirmed();const saved=await read();await page.reload();await ready();assert.deepEqual((await read()).pieces,saved.pieces);await page.locator('#start').click();
  await act('settings');await page.locator('#import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await sleep(250);assert.deepEqual((await read()).pieces,saved.pieces);
  const safety=page.waitForEvent('download');await page.locator('#import').setInputFiles({name:'workshop.json',mimeType:'application/json',buffer:backup});await(await safety).saveAs(`${out}/pre-import.json`);await page.waitForFunction(()=>window.__YAOHUO__.view().modal==='');assert.deepEqual((await read()).pieces,saved.pieces);log('collection save, reload, rejected invalid import and own backup roundtrip');
  assert.equal(errors.length,0,'no runtime errors');assert.equal(failedRequests.length,0,'no failed asset requests');
}catch(e){failure={message:e.message,stack:e.stack,state:await read().catch(()=>null),view:await view().catch(()=>null)};console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{
  await page.mouse.up().catch(()=>{});await page.keyboard.up('KeyR').catch(()=>{});
  const report={date:new Date().toISOString(),base,browser:browser.version(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),method:'Fresh empty Chrome context; real navigation, mouse and keyboard input through both craft chains. No stage fixtures or state mutation. Read-only diagnostics locate visible surfaces and assert results. Assisted firing and accelerated waiting remain normal user settings.',passed:!failure&&!errors.length&&!failedRequests.length,steps,completed,exports,errors,failedRequests,failure};
  await fs.writeFile(process.env.QA_REPORT||`qa/${prefix}.json`,JSON.stringify(report,null,2));await context.close();await browser.close();
}
