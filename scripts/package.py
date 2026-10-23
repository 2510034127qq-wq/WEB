"""Build a portable, dependency-free runtime plus editable source ZIP."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
out=ROOT/'release';out.mkdir(exist_ok=True)
archive=out/f'yaohuo-{version}.zip'
roots=['dist','src','public','art','scripts','tests','docs','licenses','qa/review','qa/exports']
files=[]
for root in roots:
    files.extend(p for p in (ROOT/root).rglob('*') if p.is_file() and p.suffix not in ['.blend1','.pyc'])
for name in ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.gitattributes','启动窑火.cmd','窑火_高仿真制瓷Web游戏_历史考证与项目方案.md']:
    files.append(ROOT/name)
files.extend((ROOT/'qa').glob('*.json'))
files.extend((ROOT/'qa').glob('*.md'))
files=[p for p in files if 'failure' not in p.name and p.name!='package-check.json']
if not (ROOT/'dist/index.html').exists():raise RuntimeError('Run npm run build first')
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
manifest={'version':version,'gitRevision':revision,'files':[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(set(files))]}
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(set(files)):z.write(p,f'yaohuo-{version}/'+p.relative_to(ROOT).as_posix())
    z.writestr(f'yaohuo-{version}/MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/(archive.name+'.sha256')).write_text(f'{digest}  {archive.name}\n',encoding='utf-8')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':digest,'files':len(set(files)),'gitRevision':revision}))
