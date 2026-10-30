"""Perceptual hash worker for src/utils/phash.ts.

Reads one image path per line on stdin and writes one line back: the image's
256-bit pHash as 64 hex characters, "ERR" if it can't be read, or "MISSING" if
the ImageHash library isn't installed. Runs for the bot's lifetime so Python and
numpy only load once.

The hash is made exactly the way github.com/SomewhatDamaged/Scam-Images builds
its list (code/build_list.py): open the image, re-save it as PNG, and take
imagehash.phash(..., hash_size=16), so our hashes can be compared with theirs.
"""
import io
import sys

try:
    import imagehash
    from PIL import Image
except ImportError:
    imagehash = None


def phash(path: str) -> str:
    with Image.open(path) as img:
        png = io.BytesIO()
        img.save(png, format="PNG")  # first frame of a GIF/WebP, same as theirs
    png.seek(0)
    with Image.open(png) as img:
        return str(imagehash.phash(img, hash_size=16))


for line in sys.stdin:
    path = line.strip()
    if imagehash is None:
        out = "MISSING"
    else:
        try:
            out = phash(path)
        except Exception:
            out = "ERR"
    sys.stdout.write(out + "\n")
    sys.stdout.flush()
