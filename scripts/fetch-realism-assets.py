"""Download finite, named CC0 source files; never scrape previews or hotlink.
Run python scripts/fetch-realism-assets.py. Provenance is append-only by file.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request, hashlib, json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
previous_path = OUT / 'realism-provenance.json'
previous = {r['file']:r for r in json.loads(previous_path.read_text('utf-8'))} if previous_path.exists() else {}
tasks = []
for alias, asset in [('agedwood', 'weathered_brown_planks'), ('wall', 'plastered_wall'), ('ground', 'cobblestone_floor_05'), ('brick', 'red_brick_03')]:
    for channel in ['diff', 'rough', 'nor_gl', 'disp', 'ao']:
        tasks.append((f'textures/realism/{alias}_{channel}.jpg', f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{asset}/{asset}_{channel}_2k.jpg', asset))
for channel in ['diff', 'nor_gl', 'rough']:
    tasks.append((f'outskirts/ground_{channel}.jpg', f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_{channel}_1k.jpg', 'forest_ground_04'))
for channel, ext in [('diff','jpg'),('alpha','png'),('nor_gl','jpg')]:
    tasks.append((f'vegetation/leaf_{channel}.{ext}', f'https://dl.polyhaven.org/file/ph-assets/Models/{ext}/1k/tree_small_02/tree_small_02_leaves_{channel}_1k.{ext}', 'tree_small_02'))
asset = 'kloofendal_48d_partly_cloudy_puresky'
tasks.append(('environment/courtyard-sky-2k.hdr', f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/{asset}_2k.hdr', asset))
def fetch(task):
    file, url, asset = task
    target = OUT / file
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        if not target.exists() or previous.get(target.relative_to(ROOT).as_posix(), {}).get('source') != url:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            download = target.with_suffix(target.suffix + '.download')
            download.write_bytes(urllib.request.urlopen(req, timeout=90).read())
            download.replace(target)
        data = target.read_bytes()
        print('OK', file, len(data), flush=True)
        return {'file': target.relative_to(ROOT).as_posix(), 'source': url, 'asset': f'https://polyhaven.com/a/{asset}', 'license': 'CC0-1.0', 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'resolution': '1k' if file.startswith(('vegetation/', 'outskirts/')) else '2k'}
    except Exception as e:
        print('FAILED', file, str(e), flush=True)
        return None
with ThreadPoolExecutor(max_workers=4) as pool:
    records = [x for x in pool.map(fetch, tasks) if x]
path = OUT / 'realism-provenance.json'
path.write_text(json.dumps(records, indent=2), encoding='utf-8')
if len(records) != len(tasks):
    raise SystemExit(f'Incomplete {len(records)}/{len(tasks)}')
