"""Compare separately captured native Studio frames. Never create or update baselines implicitly."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument("baseline", type=Path)
parser.add_argument("current", type=Path)
parser.add_argument("--threshold", type=float, default=0.001)
args = parser.parse_args()
if args.baseline.resolve() == args.current.resolve():
    raise SystemExit('Baseline and current capture directories must be different')
if not 0 <= args.threshold <= 1:
    raise SystemExit('Threshold must be between 0 and 1')
results = []
for baseline in sorted(args.baseline.glob("*.png")):
    current = args.current / baseline.name
    if not current.exists():
        results.append({"name": baseline.name, "passed": False, "reason": "missing capture"})
        continue
    with Image.open(baseline) as a, Image.open(current) as b:
        if a.size != b.size:
            results.append({"name": baseline.name, "passed": False, "reason": "viewport changed"})
            continue
        delta = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
        changed = sum(max(pixel) > 12 for pixel in delta.getdata())
        ratio = changed / (a.width * a.height)
        results.append({"name": baseline.name, "passed": ratio <= args.threshold, "changedRatio": ratio})
        if ratio > args.threshold:
            delta.save(args.current / (baseline.stem + ".diff.png"))
if not results:
    raise SystemExit("No reviewed native baseline images found")
print(json.dumps({"passed": all(r["passed"] for r in results), "results": results}, indent=2))
raise SystemExit(0 if all(r["passed"] for r in results) else 1)
