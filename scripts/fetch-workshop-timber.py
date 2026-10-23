"""Keep the original CC0 fine-grained board maps and record scale uncertainty."""
import urllib.request,json,pathlib,hashlib
from concurrent.futures import ThreadPoolExecutor
ROOT=pathlib.Path(__file__).resolve().parents[1]
record=ROOT/'public/assets/craft-surface-provenance.json'
rows=json.loads(record.read_text());key='fine_grained_wood'
def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=90).read()
data=json.loads(get('https://api.polyhaven.com/files/'+key))
def fetch(pair):
 alias,kind=pair;entry=data[kind]['4k']['jpg'];path=ROOT/'public/assets/craft-surfaces'/('solidwood_'+alias+'.jpg')
 if not path.exists():path.write_bytes(get(entry['url']))
 raw=path.read_bytes();assert hashlib.md5(raw).hexdigest()==entry['md5']
 return {'file':path.relative_to(ROOT).as_posix(),'source':entry['url'],'asset':'https://polyhaven.com/a/'+key,'license':'CC0-1.0','metres':.6,
  'dimensionNote':'API dimensions 600mm conflict with legacy scale 30x30CM. Use API dimensions and retain the discrepancy.',
  'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
with ThreadPoolExecutor(max_workers=3) as ex:new=list(ex.map(fetch,[('diff','Diffuse'),('rough','Rough'),('nor_gl','nor_gl'),('ao','AO')]))
record.write_text(json.dumps([r for r in rows if 'solidwood_' not in r['file']]+new,indent=2))
print('DOWNLOADED',key)
