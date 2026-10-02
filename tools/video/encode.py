"""frames/*.png -> media/demo.webp (animated, plays inline in the README) and media/poster.png"""
import glob
import os
import sys

from PIL import Image

frames_dir, media_dir, fps = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(media_dir, exist_ok=True)
files = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
W, H = 960, 540
frames = [Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS) for f in files]
frames[0].save(
    os.path.join(media_dir, 'demo.webp'),
    save_all=True,
    append_images=frames[1:],
    duration=round(1000 / fps),
    loop=0,
    quality=82,
    method=4,
)
poster = Image.open(files[min(len(files) - 1, int(8.6 * fps))]).convert('RGB')
poster.save(os.path.join(media_dir, 'poster.png'), optimize=True)
size = os.path.getsize(os.path.join(media_dir, 'demo.webp'))
print(f'demo.webp: {len(frames)} frames, {size / 1e6:.1f} MB')
