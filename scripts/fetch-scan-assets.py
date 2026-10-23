import pathlib,json,urllib.request,hashlib,time,sys
from concurrent.futures import ThreadPoolExecutor
ids=['chinese_console_table','chinese_stool','wicker_basket_01','ceramic_pot','wooden_bucket_01','wooden_stool_01']
if len(sys.argv)>1:ids=sys.argv[1:]
root=pathlib.Path('public/assets/scans');root.mkdir(parents=True,exist_ok=True)
record=pathlib.Path('public/assets/scan-provenance.json')
rows=json.loads(record.read_text()) if record.exists() else []
rows=[r for r in rows if r['asset'].split('/')[-1] not in ids]
def get(url):
 for i in range(3):
  try:return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=80).read()
  except Exception:
   if i==2:raise
   time.sleep(1)
for k in ids:
 meta=pathlib.Path('.tmp/'+k+'-files.json')
 if not meta.exists():meta.write_bytes(get('https://api.polyhaven.com/files/'+k))
 d=json.loads(meta.read_text());f=d['gltf']['4k']['gltf'];folder=root/k;folder.mkdir(exist_ok=True)
 tasks=[(folder/(k+'.gltf'),f)]+[(folder/p,x) for p,x in f['include'].items()]
 def fetch(row):
  p,m=row;p.parent.mkdir(parents=True,exist_ok=True)
  if not p.exists():p.write_bytes(get(m['url']))
  b=p.read_bytes()
  if hashlib.md5(b).hexdigest()!=m['md5']:raise ValueError('hash mismatch '+str(p))
  return {'file':p.as_posix(),'source':m['url'],'license':'CC0-1.0','asset':'https://polyhaven.com/a/'+k,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 with ThreadPoolExecutor(max_workers=4) as ex:rows+=list(ex.map(fetch,tasks))
 print('DOWNLOADED',k,flush=True)
pathlib.Path('public/assets/scan-provenance.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
