#!/usr/bin/env python3
"""Make small preview copies (720 px, images/t/) of every picture in images/, for the grids on
Work, News, Film and Photos. The admin makes these itself for new uploads; this fills in any missing.
macOS only (uses sips)."""
import os, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, dst = os.path.join(ROOT, 'images'), os.path.join(ROOT, 'images', 't')
os.makedirs(dst, exist_ok=True)
n = 0
for f in sorted(os.listdir(src)):
    if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
        continue
    out = os.path.join(dst, os.path.splitext(f)[0] + '.jpg')
    if os.path.exists(out):
        continue
    subprocess.run(['sips', '-Z', '720', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72',
                    os.path.join(src, f), '--out', out], check=True, capture_output=True)
    n += 1
print('made', n, 'previews')
