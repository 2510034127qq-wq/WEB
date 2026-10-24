import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {newState,newPiece} from '../src/simulation/model.ts';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],checks=[],samples=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>({state:window.__YAOHUO__.snapshot(),view:window.__YAOHUO__.view()}));
const check=(condition,name)=>{checks.push({name,passed:!!condition});assert(condition,name);};
const prefix=process.env.QA_PREFIX||'glaze-r25';
async function grab(){
  const point=await page.evaluate(()=>{
    const d=window.__YAOHUO__,b=d.view().pieceBounds;
    for(const fy of [.55,.4,.7,.25])for(const fx of [.5,.4,.6]){
      const x=b.x+b.w*fx,y=b.y+b.h*fy,h=d.hitPiece(x,y);
      if(h?.surface==='outer'&&document.elementFromPoint(x,y)?.tagName==='CANVAS')return {x,y};
    }
    return null;
  });
  assert(point,'visible clay contact');
  await page.mouse.move(point.x,point.y);await page.mouse.down();return point;
}
try{
  await page.goto(process.env.QA_URL||'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__YAOHUO__,null,{timeout:120000});await page.locator('#start').click();
  for(const [form,height] of [['bowl',.16],['vase',.44]]){
    const state=newState(),p=newPiece(form,1);
    Object.assign(p,{height,stage:'trimmed',location:'glaze',position:[7.2,.95,-.2],opened:true,trimmed:1,preparation:1,moisture:.25});
    state.pieces=[p];state.activeId=p.id;state.player=[5.6,1.65,-.2];
    await page.locator('[data-act="settings"]').click();const backup=page.waitForEvent('download');
    await page.locator('#import').setInputFiles({name:'glaze-contact.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await backup;
    await page.waitForFunction(()=>window.__YAOHUO__.view().modal==='');await page.keyboard.press('KeyE');await page.waitForTimeout(2200);
    const initialGeometry=(await read()).view.pieceGeometry;
    let point=await grab();
    if(form==='bowl'){
      await page.mouse.move(point.x,point.y+48,{steps:16});await page.waitForTimeout(700);
      const hover=await read();samples.push({name:'bowl hover',...hover});
      check(hover.view.glazeContact.immersed===0,'short bowl remains above liquid at 20% travel');
      check(hover.state.pieces[0].glaze.every(v=>v===0),'hovering does not apply glaze');
    }
    await page.mouse.move(point.x,Math.min(890,point.y+285),{steps:35});
    // If a tall vessel starts near the bottom of the viewport, another real drag
    // supplies the remaining travel without writing any game state.
    if((await read()).view.glazeContact.travel<.999){await page.mouse.up();point=await grab();await page.mouse.move(point.x,Math.min(890,point.y+250),{steps:30});}
    await page.waitForTimeout(1800);const immersed=await read();samples.push({name:form+' immersed',...immersed});
    const contact=immersed.view.glazeContact,coating=immersed.state.pieces[0].glaze;
    check(contact.travel>.99,form+' full physical drag travel');
    check(Math.abs(contact.renderedBottom-contact.bottom)<1e-5,form+' render and contact positions agree');
    check(contact.renderedBottom>=1.036-1e-5,form+' stays above the solid vat floor');
    check(coating.some(v=>v>0),form+' actual immersion applies glaze');
    check(immersed.view.pieceGeometry===initialGeometry,form+' coating keeps the exact original geometry resource');
    if(form==='vase'){
      check(contact.atFloor&&contact.immersed<.65,'tall vase is limited by actual vat capacity');
      check(coating.slice(8*16).every(v=>v===0),'dry upper vase receives no phantom glaze');
    }else check(contact.immersed===1,'short bowl fully immerses');
    await page.screenshot({path:`qa/${prefix}-${form}.png`});
    await page.mouse.move(point.x,Math.max(10,point.y-240),{steps:35});await page.mouse.up();await page.waitForTimeout(300);
    if(form==='vase'){
      check((await read()).view.glazeContact.travel<.01,'vase lifted out before touch-up');
      await page.keyboard.down('ShiftLeft');
      const brushStarted=Date.now();
      for(let turn=0;turn<16;turn++){
        const line=await page.evaluate(()=>{
          const d=window.__YAOHUO__,b=d.view().pieceBounds,found=[];
          for(const target of [.97,.65]){
            let best=null;
            for(let y=Math.max(5,b.y);y<Math.min(895,b.y+b.h);y+=4){
              const x=b.x+b.w*.5,h=d.hitPiece(x,y);
              if(h?.surface==='outer' && (!best||Math.abs(h.uv[1]-target)<best.error))best={x,y,error:Math.abs(h.uv[1]-target)};
            }found.push(best);
          }return found;
        });
        assert(line.every(Boolean),'visible upper glaze brush path');
        await page.mouse.move(line[0].x,line[0].y);await page.mouse.down();
        for(let stroke=0;stroke<1;stroke++){
          await page.mouse.move(line[1].x,line[1].y,{steps:30});await page.mouse.move(line[0].x,line[0].y,{steps:30});
        }
        if(turn===0)await page.screenshot({path:`qa/${prefix}-brush.png`});
        await page.mouse.up();await page.mouse.wheel(0,2*Math.PI/16/.003);await page.waitForTimeout(70);
      }
      await page.keyboard.up('ShiftLeft');
      const brushed=await read();samples.push({name:'vase brushed around circumference',...brushed});
      samples.push({name:'brush input timing',milliseconds:Date.now()-brushStarted,turns:16,strokes:32,mouseSteps:960});
      check(brushed.view.pieceGeometry===initialGeometry,'all brush strokes preserve the original vessel mesh');
      const upper=brushed.state.pieces[0].glaze.slice(8*16);
      check(upper.filter(v=>v>.1).length/upper.length>.85,'real brush strokes cover previously dry upper circumference');
      await page.screenshot({path:`qa/${prefix}-brushed.png`});
    }
    await page.keyboard.press('Escape');
  }
  check(!errors.length,'no uncaught runtime errors');
}catch(e){errors.push(e.stack);await page.screenshot({path:`qa/${prefix}-failure.png`}).catch(()=>{});process.exitCode=1;}
finally{
  const bundles=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\/assets\/.*\.js$/.test(n))).catch(()=>[]);
  await fs.writeFile(`qa/${prefix}.json`,JSON.stringify({date:new Date().toISOString(),method:'Public import fixtures then actual mouse drags; diagnostic state is read-only.',checks,samples,errors,bundles},null,2));
  await browser.close();console.log(JSON.stringify({checks,errors},null,2));
}
