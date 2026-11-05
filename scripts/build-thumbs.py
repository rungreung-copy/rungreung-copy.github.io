"""สร้างรูปย่อสำหรับการ์ดผลงานและแกลเลอรี: images/works/<หมวด>/x.* -> images/thumbs/<หมวด>/x.webp
GitHub Actions รันไฟล์นี้ทุกครั้งที่ push ร้านแค่วางรูปในโฟลเดอร์ ไม่ต้องย่อเอง
รันเองในเครื่องได้ด้วย: python scripts/build-thumbs.py (ต้องมี Pillow)"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
WORKS = ROOT / "images" / "works"
THUMBS = ROOT / "images" / "thumbs"
SHORT_SIDE = 420  # การ์ดกว้างสุดราว 185px ย่อให้คมบนจอ 2x
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}

made = 0
for src in sorted(p for p in WORKS.rglob("*") if p.suffix.lower() in IMAGE_EXT):
    out = THUMBS / src.relative_to(WORKS).with_suffix(".webp")
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        continue
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    scale = SHORT_SIDE / min(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=74, method=6)
    made += 1

total = sum(f.stat().st_size for f in THUMBS.rglob("*.webp"))
print(f"thumbs: {made} new, {sum(1 for _ in THUMBS.rglob('*.webp'))} total, {total // 1024} KB")
