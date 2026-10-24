"""Upgrade the same CC0 brick scan to its published 4K maps; keep provenance."""
import json,hashlib,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Yaohuo asset preparation'}),timeout=120) as response:return response.read()
catalog=json.loads(get('https://api.polyhaven.com/files/red_brick_03'))
record=ROOT/'public/assets/realism-provenance.json'
rows=json.loads(record.read_text('utf-8'))
def fetch(channel):
    key={'diff':'Diffuse','rough':'Rough','disp':'Displacement','ao':'AO'}.get(channel,channel)
    item=catalog[key]['4k']['jpg']
    data=get(item['url']);assert hashlib.md5(data).hexdigest()==item['md5']
    path=ROOT/f'public/assets/textures/realism/brick_{channel}.jpg';path.write_bytes(data)
    return {'file':path.relative_to(ROOT).as_posix(),'source':item['url'],'asset':'https://polyhaven.com/a/red_brick_03','license':'CC0-1.0','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'resolution':'4k','sourceWidthMetres':1}
with ThreadPoolExecutor(max_workers=3) as pool:updates=list(pool.map(fetch,['diff','rough','nor_gl','disp','ao']))
rows=[r for r in rows if r['file'] not in [u['file'] for u in updates]]+updates
record.write_text(json.dumps(rows,indent=2),encoding='utf-8')
print('Verified original 4K brick channels:',len(updates))
