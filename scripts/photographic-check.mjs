import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const prefix=process.env.QA_PREFIX||'photographic-r7';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(), errors=[], views=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const source=JSON.parse(await fs.readFile('qa/exports/workshop.json','utf8'));
const stations={
  supply:{player:[-6,1.65,3.6],position:[-6,.92,5]},
  wheel:{player:[0,1.65,-3.9],position:[0,.78,-5.6]},
  paint:{player:[5.4,1.65,-3.8],position:[5.4,.96,-5.6]},
  glaze:{player:[5.6,1.65,-.2],position:[7.2,.95,-.2]},
  vat:{player:[5.6,1.65,-.2],position:[7.2,.95,-.2]},
  display:{player:[0,1.65,3.7],position:[0,.96,5.8]},
  kiln:{player:[6,1.65,2.75],position:[6,.45,4.65]},
  hotkiln:{player:[6,1.65,2.75],position:[6,.45,4.65]},
};
try {
  await page.goto(base);
  await page.waitForFunction(()=>window.__YAOHUO__,null,{timeout:120000});
  await page.locator('#start').click();
  for(const name of process.env.QA_VIEWS?.split(',')||['courtyard','gate','supply','wheel','paint','glaze','display','kiln']) {
    const s=structuredClone(source),p=s.pieces.find(q=>q.form==='vase');
    s.activeId=p.id;s.held=null;s.yaw=name==='gate'?Math.PI:0;s.player=stations[name]?.player||[0,1.65,1.4];
    if(stations[name]) {
      p.position=stations[name].position;p.location=name;
      p.stage=name==='wheel'?'thrown':['paint','glaze'].includes(name)?'trimmed':'fired';
      if(name==='wheel'){p.marks=[];p.glaze=Array(192).fill(0);p.moisture=.7;p.shrink=1;}
    }
    if(name==='vat'){s.pieces=[];s.activeId=null;}
    if(name==='hotkiln'){
      p.location='kiln';p.stage='loaded';
      Object.assign(s.kiln,{phase:'firing',temperature:600,fuel:1,draft:.6,assisted:true});
    }
    await page.locator('[data-act="settings"]').click();
    const backup=page.waitForEvent('download');
    await page.locator('#import').setInputFiles({name:'photo-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
    await backup;
    await page.waitForFunction(()=>window.__YAOHUO__?.view().modal==='');
    if(stations[name]) await page.keyboard.press('KeyE');
    await page.waitForTimeout(4600);
    if(['kiln','hotkiln','glaze','vat'].includes(name))await page.waitForFunction(name=>{
      const v=window.__YAOHUO__.view(),goal=['kiln','hotkiln'].includes(name)?[6,1.55,2.6]:[6.62,1.92,.38];
      return Math.hypot(...v.camera.map((x,i)=>x-goal[i]))<.0005;
    },name,{timeout:45000});
    const image=`qa/${prefix}-${name}.png`;
    await page.screenshot({path:image});
    views.push({name,image,...await page.evaluate((name)=>({view:window.__YAOHUO__.view(),stats:window.__YAOHUO__.stats(),
      surfaces:['display','supply'].includes(window.__YAOHUO__.view().focus)?[[810,700],[950,600],[1000,760],[1020,470]].map(([x,y])=>({screen:[x,y],...window.__YAOHUO__.inspectSurface(x,y)})):undefined,
      terrain:name==='gate'?window.__YAOHUO__.inspectMeshes?.('woodland_litter'):undefined,
      grass:name==='gate'?(()=>{const cells=window.__YAOHUO__.inspectMeshes?.('Bank_grass')||[];return {cells:cells.length,instances:cells.reduce((n,c)=>n+c.instances,0),sample:cells.slice(0,3)};})():undefined,
    }),name)});
    console.log('CAPTURED',name);
    if(stations[name]) await page.keyboard.press('Escape');
  }
} finally {
  const bundles=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\/assets\/.*\.js$/.test(n))).catch(()=>[]);
  await fs.writeFile(`qa/${prefix}.json`,JSON.stringify({date:new Date().toISOString(),url:base,bundles,method:'Public JSON import fixtures; real E/Escape input; read-only diagnostics. Images require visual review.',errors,views},null,2));
  await browser.close();
}
if(errors.length)process.exitCode=1;
