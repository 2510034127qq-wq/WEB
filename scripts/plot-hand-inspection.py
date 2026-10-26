import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
root=Path(__file__).resolve().parents[1]
d=json.loads((root/'.tmp/user-hands-inspection.json').read_text())
fig,axes=plt.subplots(2,3,figsize=(16,10))
for row,(side,obs) in enumerate(d.items()):
    p=np.array(next(o['positions'] for o in obs if o['type']=='MESH'))
    for col,(a,b) in enumerate([(0,1),(0,2),(1,2)]):
        ax=axes[row,col];ax.scatter(p[:,a],p[:,b],s=.1);ax.set_aspect('equal');ax.grid();ax.set_title(f'{side}: {"XYZ"[a]} / {"XYZ"[b]}')
fig.tight_layout();fig.savefig(root/'qa/user-hand-source-projections.png',dpi=140)
