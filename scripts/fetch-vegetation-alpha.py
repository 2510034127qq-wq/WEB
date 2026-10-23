"""Some upstream glTF exports omit alpha. Retain the official 4K opacity maps."""
from pathlib import Path
import json, urllib.request, hashlib
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'public/assets/vegetation';folder.mkdir(exist_ok=True)
records=[]
for asset,key,filename in [('pine_tree_01','twig_alpha','pine-twig-alpha.png'),('grass_bermuda_01','Alpha','grass-alpha.png')]:
    request=urllib.request.Request('https://api.polyhaven.com/files/'+asset,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=60) as r:meta=json.load(r)
    info=meta[key]['4k']['png'];p=folder/filename
    if not p.exists():
        with urllib.request.urlopen(urllib.request.Request(info['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=90) as r:p.write_bytes(r.read())
    data=p.read_bytes()
    if hashlib.md5(data).hexdigest()!=info['md5']:raise ValueError(filename)
    records.append({'file':p.relative_to(ROOT).as_posix(),'source':info['url'],'license':'CC0-1.0',
                    'asset':'https://polyhaven.com/a/'+asset,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    print('ALPHA',filename,len(data),flush=True)
(ROOT/'public/assets/vegetation-alpha-provenance.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
