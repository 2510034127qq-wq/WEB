"""Measure the visible side-pull segment; this does not infer hidden inputs."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--video", default=r"C:\Users\Admin\Videos\屏幕录制\屏幕录制 2026-10-26 193953.mp4")
parser.add_argument("--output", default="qa/sculpt-reference-analysis.json")
args = parser.parse_args()
capture = cv2.VideoCapture(args.video)
fps = capture.get(cv2.CAP_PROP_FPS)
capture.set(cv2.CAP_PROP_POS_MSEC, 1500)
ok, frame = capture.read()
assert ok, "Cannot decode the supplied reference"
cursor = frame[447:473, 838:862].copy()
samples = []
for index in range(round(1.2 * fps), round(2.4 * fps) + 1):
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    assert ok
    search = frame[400:510, 650:1050]
    matches = cv2.matchTemplate(search, cursor, cv2.TM_CCOEFF_NORMED)
    _, confidence, _, point = cv2.minMaxLoc(matches)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    radii = []
    for y in range(441, 450):
        row = hsv[y]
        clay = (row[:, 0] >= 14) & (row[:, 0] <= 38) & (row[:, 1] <= 135)
        if not clay[610]:
            continue
        left, right = 610, 610
        while left > 470 and clay[left - 1]:
            left -= 1
        while right < 750 and clay[right + 1]:
            right += 1
        radii.append((right - left) / 2)
    samples.append({"time": index / fps, "cursorX": point[0] + 650 + 12,
                    "cursorY": point[1] + 400 + 13, "cursorConfidence": confidence,
                    "radiusPixels": float(np.median(radii)) if radii else None})
capture.release()
fit = [s for s in samples if s["cursorConfidence"] > .8 and s["radiusPixels"] is not None
       and 1.3 <= s["time"] <= 2.1]
assert len(fit) >= 10, "Not enough visible cursor/silhouette samples"
x = np.array([s["cursorX"] for s in fit])
y = np.array([s["radiusPixels"] for s in fit])
gain, intercept = np.polyfit(x, y, 1)
error = float(np.sqrt(np.mean((y - (gain * x + intercept)) ** 2)))
report = {"source": args.video, "fps": fps,
          "method": "Visible cursor template and clay silhouette at image rows 441-449; linear fit on 1.3-2.1 s. No hidden input or playback-speed claim.",
          "radialScreenGain": float(gain), "fitRmsePixels": error, "fitSamples": len(fit),
          "cursorRange": [float(x.min()), float(x.max())],
          "radiusRange": [float(y.min()), float(y.max())], "samples": samples}
Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "samples"}, ensure_ascii=False, indent=2))
