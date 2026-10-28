"""Measure the actual rendered silhouette in the controlled Chrome sculpt fixture."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("prefix", help="QA stem, e.g. sculpt-r50")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
report = json.loads((root / "qa" / f"{args.prefix}.json").read_text(encoding="utf-8"))
reference = json.loads((root / "qa/sculpt-reference-analysis.json").read_text(encoding="utf-8"))
probe = next(m for m in report["measurements"] if m["name"] == "step response")
move = next(e for e in probe["events"] if e["type"] == "pointermove")
y = round(move["y"])
outlines = {}
for suffix in ["start", "response"]:
    path = root / "qa" / f"{args.prefix}-{suffix}.png"
    image = cv2.imread(str(path))
    assert image is not None, f"Missing screenshot: {path}"
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    rows = []
    for yy in range(y - 4, y + 5):
        row = hsv[yy]
        # In this fixture the olive wet clay is separated from brown wood and
        # neutral/cool shelving. Include white specular pixels; close narrow
        # highlight/antialias holes. This is not a general segmentation model.
        mask = ((row[:, 0] >= 20) & (row[:, 0] <= 40) & (row[:, 2] > 65)) | (
            (row[:, 1] < 20) & (row[:, 2] > 170))
        mask = cv2.morphologyEx(mask.astype(np.uint8)[None, :], cv2.MORPH_CLOSE,
                               np.ones((1, 15), np.uint8))[0]
        left = right = image.shape[1] // 2
        assert mask[left], "Fixture clay must cover the central measurement ray"
        while left > 700 and mask[left - 1]:
            left -= 1
        while right < 1220 and mask[right + 1]:
            right += 1
        assert left > 700 and right < 1220, "Segmentation escaped vessel ROI"
        rows.append({"y": yy, "left": left, "right": right, "radius": (right-left)/2})
    outlines[suffix] = {"rows": rows, "medianRadius": float(np.median([r["radius"] for r in rows]))}
delta = outlines["response"]["medianRadius"] - outlines["start"]["medianRadius"]
gain = delta / 188
output = {
    "capture": args.prefix, "sourceMeasurement": "sculpt-reference-analysis.json",
    "method": "9 screenshot rows around the actual cursor; olive mask plus specular pixels; median half-width. Controlled 1920x1080 fixture only; edge uncertainty approximately 2 px.",
    "outlines": outlines, "cursorDisplacement": 188, "radiusDeltaPixels": delta,
    "screenGain": gain, "referenceGain": reference["radialScreenGain"],
    "difference": gain - reference["radialScreenGain"],
    "passed": abs(gain-reference["radialScreenGain"]) < .025,
}
(root / "qa" / f"{args.prefix}-pixels.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in output.items() if k != "outlines"}, indent=2))
assert output["passed"], "Rendered silhouette gain differs from the visible reference segment"
