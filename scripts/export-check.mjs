import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const prefix=process.env.QA_PREFIX||'export-r18',errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true,downloadsPath:'.tmp/playwright-downloads'});
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const report=JSON.parse(await fs.readFile('qa/craft-chain-r17.json','utf8'));
const state=report.failure.state;assert(state&&state.pieces.length);
let failure=null;const exports=[];
try{
 await page.goto(process.env.QA_URL||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__YAOHUO__,null,{timeout:120000});await page.locator('#start').click();
 await page.locator('[data-act="settings"]').click();const safety=page.waitForEvent('download');
 await page.locator('#import').setInputFiles({name:'real-playthrough-recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await safety;
 await page.waitForFunction(()=>window.__YAOHUO__.view().modal==='');await page.keyboard.press('KeyE');
 await page.waitForTimeout(5000);await page.screenshot({path:`qa/${prefix}-display.png`});
 await page.locator('#work details summary').click();
 for(const [action,extension] of [['export-glb','glb'],['photo','png']]){
  const event=page.waitForEvent('download');await page.locator(`[data-act="${action}"]`).click();const download=await event;
  const path=`qa/exports/${prefix}.${extension}`;const error=await download.failure();assert.equal(error,null,`${action}: ${error}`);
  await download.saveAs(path);const data=await fs.readFile(path);
  if(extension==='glb'){assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(8),data.length);}
  else assert.equal(data.subarray(1,4).toString(),'PNG');exports.push({action,path,bytes:data.length});
 }
 assert.equal(errors.length,0);
}catch(e){failure=e.message;process.exitCode=1;console.error(e);}
finally{await fs.writeFile(`qa/${prefix}.json`,JSON.stringify({method:'Public import of the actual r17 playthrough state solely to isolate export; not a full-chain pass.',passed:!failure,exports,errors,failure},null,2));await browser.close();}
