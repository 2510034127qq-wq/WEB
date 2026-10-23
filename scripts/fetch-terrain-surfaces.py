"""CC0 measured-scale path and woodland litter maps, downloaded without resampling."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, urllib.request

ROOT=Path(__file__).resolve().parents[1]
output=ROOT/'public/assets/terrain';output.mkdir(parents=True,exist_ok=True)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Yaohuo asset preparation'}),timeout=120) as response:
        return response.read()
tasks=[]
for alias,asset,metres in [('path','brown_mud_02',1.3),('litter','forest_leaves_03',2.3)]:
    meta=json.loads(get('https://api.polyhaven.com/files/'+asset))
    for channel,key in [('diff','Diffuse'),('normal','nor_gl'),('rough','Rough'),('ao','AO'),('height','Displacement')]:
        info=meta[key]['4k']['jpg'];tasks.append((alias,asset,metres,channel,info))
def fetch(task):
    alias,asset,metres,channel,info=task;path=output/f'{alias}_{channel}.jpg'
    if not path.exists():path.write_bytes(get(info['url']))
    data=path.read_bytes()
    if hashlib.md5(data).hexdigest()!=info['md5']:raise ValueError(f'Hash mismatch: {path}')
    print(path.name,len(data),flush=True)
    return {'file':path.relative_to(ROOT).as_posix(),'source':info['url'],'asset':'https://polyhaven.com/a/'+asset,
            'license':'CC0-1.0','metres':metres,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
with ThreadPoolExecutor(max_workers=3) as executor:records=list(executor.map(fetch,tasks))
(ROOT/'public/assets/terrain-provenance.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
