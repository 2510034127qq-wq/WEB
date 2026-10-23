"""Fetch a bounded CC0 PBR set; save hashes and provenance, never hotlink at runtime."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request, hashlib, json
ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'public/assets/textures'
out.mkdir(parents=True, exist_ok=True)
assets = {'wood':'wood_table_001','wall':'plastered_wall_02','ground':'cobblestone_floor_05','brick':'red_brick_03'}
def fetch(item):
    key, asset, channel = item
    filename = f'{asset}_{channel}_1k.jpg'
    url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{filename}'
    path = out / f'{key}_{channel}.jpg'
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    try:
        if not path.exists(): path.write_bytes(urllib.request.urlopen(req, timeout=45).read())
        return {'file':str(path.relative_to(ROOT)).replace('\\','/'),'source':url,'asset':f'https://polyhaven.com/a/{asset}','license':'CC0-1.0','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    except Exception as e:
        print('FAILED',url,str(e),flush=True)
        return None
with ThreadPoolExecutor(max_workers=5) as ex:
    records=list(ex.map(fetch,[(k,a,c) for k,a in assets.items() for c in ['diff','rough','nor_gl']]))
records=[r for r in records if r]
(ROOT/'public/assets/provenance.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(f'Downloaded {len(records)}/12 maps',flush=True)
