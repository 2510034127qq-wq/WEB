import pathlib,urllib.request,json,hashlib
from concurrent.futures import ThreadPoolExecutor
root=pathlib.Path('public/assets/craft-surfaces');root.mkdir(exist_ok=True)
assets={'linen':'rough_linen','earthenware':'clay_plaster','timber':'wooden_planks','oldplaster':'worn_plaster_wall','rooftile':'grey_roof_tiles','bamboo':'bamboo_veneer','iron':'metal_plate'}
tasks=[]
for alias,asset in assets.items():
 req=urllib.request.Request('https://api.polyhaven.com/files/'+asset,headers={'User-Agent':'Mozilla/5.0'});d=json.load(urllib.request.urlopen(req,timeout=30))
 for channel,key in [('diff','Diffuse'),('rough','Rough'),('nor_gl','nor_gl'),('ao','AO'),('disp','Displacement'),('metal','Metal')]:
  if key in d:
   m=d[key].get('4k',d[key].get('2k'));m=m.get('jpg',m.get('png'))
   if m:tasks.append((alias,asset,channel,m))
def fetch(row):
 alias,asset,channel,m=row;ext=m['url'].rsplit('.',1)[-1];p=root/(alias+'_'+channel+'.'+ext)
 if not p.exists():p.write_bytes(urllib.request.urlopen(urllib.request.Request(m['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=80).read())
 b=p.read_bytes();assert hashlib.md5(b).hexdigest()==m['md5']
 print(p.name,len(b),flush=True)
 return {'file':p.as_posix(),'source':m['url'],'asset':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
with ThreadPoolExecutor(max_workers=4) as ex:rows=list(ex.map(fetch,tasks))
pathlib.Path('public/assets/craft-surface-provenance.json').write_text(json.dumps(rows,indent=2))
