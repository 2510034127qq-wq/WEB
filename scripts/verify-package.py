"""Validate hashes and extract into a fresh workspace directory, without dependencies."""
from pathlib import Path
import argparse,hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('archive');parser.add_argument('--out',required=True);args=parser.parse_args()
archive=Path(args.archive).resolve();out=Path(args.out).resolve()
if out.exists() or out==ROOT or not out.is_relative_to(ROOT):raise RuntimeError('Choose a new output directory inside the workspace')
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        if not (out/item.filename).resolve().is_relative_to(out):raise RuntimeError('Invalid archive path')
    if z.testzip():raise RuntimeError('ZIP checksum failed')
    out.mkdir(parents=True);z.extractall(out)
manifests=list(out.glob('*/MANIFEST.json'))
assert len(manifests)==1
root=manifests[0].parent;manifest=json.loads(manifests[0].read_text(encoding='utf-8'))
for entry in manifest['files']:
    path=root/entry['path'];data=path.read_bytes()
    assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256'],entry['path']
assert not (root/'node_modules').exists()
report={'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'extractedRoot':str(root),'filesVerified':len(manifest['files']),'gitRevision':manifest['gitRevision'],'includesNodeModules':False,'status':'passed'}
(ROOT/'qa'/'package-check.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
