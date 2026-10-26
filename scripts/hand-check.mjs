import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],poses=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto((process.env.QA_URL||'http://127.0.0.1:5190/')+'hand-lab.html');
await page.waitForFunction(()=>window.__HAND_LAB__,null,{timeout:60000});
for(const pose of ['open','fist','pinch','tool','wheel']){
 await page.locator(`[data-pose="${pose}"]`).click();await page.waitForTimeout(2500);
 poses.push(await page.evaluate(()=>window.__HAND_LAB__.inspect()));
 await page.screenshot({path:`qa/hands-${process.env.QA_PREFIX||'r29'}-${pose}.png`});
}
await fs.writeFile(`qa/hands-${process.env.QA_PREFIX||'r29'}.json`,JSON.stringify({errors,poses},null,2));
await browser.close();if(errors.length)process.exitCode=1;
