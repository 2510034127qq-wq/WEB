import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const temp=fileURLToPath(new URL('../.tmp/vitest-runtime',import.meta.url));
mkdirSync(temp,{recursive:true});
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp},windowsHide:true,
});
process.exit(result.status??1);
