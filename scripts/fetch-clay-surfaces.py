"""Fetch the two 20cm ambientCG clay samples used in the game, with provenance."""
from pathlib import Path
import hashlib
import json
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Yaohuo asset preparation"}), timeout=120) as response:
        return response.read()

def main():
    catalog = json.loads(get("https://ambientcg.com/api/v2/full_json?type=Material&limit=30&q=clay&include=downloadData"))
    output = ROOT / "public/assets/clay-surfaces"
    cache = ROOT / ".tmp/clay-downloads"
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    records = []
    for asset_id in ("Clay005", "Clay006"):
        asset = next(a for a in catalog["foundAssets"] if a["assetId"] == asset_id)
        download = next(d for d in asset["downloadFolders"]["default"]["downloadFiletypeCategories"]["zip"]["downloads"] if d["attribute"] == "4K-JPG")
        archive = cache / download["fileName"]
        if not archive.exists():
            archive.write_bytes(get(download["downloadLink"]))
        if archive.stat().st_size != download["size"]:
            raise ValueError(f"Incomplete archive: {archive}")
        with zipfile.ZipFile(archive) as bundle:
            for item in bundle.infolist():
                name = Path(item.filename).name
                if not name.endswith(".jpg") or not any(channel in name for channel in ("Color", "NormalGL", "Roughness", "Displacement")):
                    continue
                path = output / name
                path.write_bytes(bundle.read(item))
                records.append({"file": path.relative_to(ROOT).as_posix(), "asset": asset["shortLink"],
                                "license": "CC0-1.0", "source": download["downloadLink"], "sourceWidthMetres": .2,
                                "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        print("CLAY_DOWNLOADED", asset_id, flush=True)
    (ROOT / "public/assets/clay-surface-provenance.json").write_text(json.dumps(records, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
