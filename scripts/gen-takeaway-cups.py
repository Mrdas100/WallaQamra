"""يولّد صور أختام «كوب السفري» لقالب Qamra Cups من صورة كوب شاهي قمرا (خلفيته مزالة).

الاستخدام: python3 scripts/gen-takeaway-cups.py <cup.png>
- public/library/takeaway-filled.png: كوب شاهي قمرا الحقيقي (ختم مكتمل)
- public/library/takeaway-empty.png: كوب ورقي أبيض بنفس الشكل (خانة فارغة)
- public/library/takeaway-reward.png: كوب شاهي قمرا مع لمعة ذهبية (الكوب المجاني)
كل الصور 240×300 بخلفية شفافة وظل خفيف أسفل الكوب.
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "library")
W, H = 240, 300
SS = 4
GOLD = (210, 173, 98)


def clean_alpha(img: Image.Image) -> Image.Image:
    """يزيل الهالة الداكنة المتبقية من إزالة الخلفية: يقلّص الحافة قليلاً ثم ينعّمها"""
    r, g, b, a = img.split()
    a = a.point(lambda v: 255 if v > 160 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    return Image.merge("RGBA", (r, g, b, a))


def white_cup(src: Image.Image) -> Image.Image:
    """كوب ورقي أبيض: نفس ظلّية الكوب مع تظليل أسطواني وفتحة علوية وحافة"""
    raw = np.array(src.split()[3]) > 128
    h, w = raw.shape
    ys, _ = np.where(raw)
    top, bottom = int(ys.min()), int(ys.max())
    span = bottom - top
    # الظلّية تُبنى هندسياً (بيضاوي علوي + جانبان مستقيمان + قاع بيضاوي) من مقاسات الكوب الأصلي،
    # لأن أطراف الصورة الأصلية فيها تعرجات من إزالة الخلفية
    def side(y):
        r = np.where(raw[int(y)])[0]
        return float(r.min()), float(r.max())

    y_a, y_b = top + span * 0.1, top + span * 0.83
    (la, ra), (lb, rb) = side(y_a), side(y_b)
    left = lambda y: la + (lb - la) * (y - y_a) / (y_b - y_a)
    right = lambda y: ra + (rb - ra) * (y - y_a) / (y_b - y_a)
    y_top = top + span * 0.07
    y_bot = top + span * 0.91
    rt = (right(y_top) - left(y_top)) / 2
    rb2 = (right(y_bot) - left(y_bot)) / 2
    ct, cb = (right(y_top) + left(y_top)) / 2, (right(y_bot) + left(y_bot)) / 2
    pts = [(ct + rt * math.cos(t), y_top - (y_top - top) * math.sin(t)) for t in np.linspace(math.pi, 0, 60)]
    pts += [(cb + rb2 * math.cos(t), y_bot + (bottom - y_bot) * math.sin(t)) for t in np.linspace(0, math.pi, 60)]
    mask = Image.new("L", (w * SS, h * SS))
    ImageDraw.Draw(mask).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    a = np.array(mask.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
    rgb = np.zeros((h, w, 3), np.float32)
    solid = a > 0.5
    for y in range(top, bottom + 1):
        row = np.where(solid[y])[0]
        if len(row) < 2:
            continue
        x0, x1 = row.min(), row.max()
        t = (np.arange(w) - x0) / max(1, x1 - x0)
        # ضوء من اليسار قليلاً وظل على الطرفين
        shade = 0.80 + 0.20 * np.clip(1 - ((t - 0.36) / 0.62) ** 2, 0, 1) ** 0.6
        rgb[y] = np.stack([shade * 252, shade * 250, shade * 245], -1)
    out = Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8), "RGBA")

    # الفتحة العلوية: بيضاوي أغمق قليلاً داخل الحافة البيضاء
    cx, cy, rx, ry = ct, y_top, rt, y_top - top
    over = Image.new("RGBA", (w * SS, h * SS))
    d = ImageDraw.Draw(over)
    box = lambda k, dy=0: [(cx - rx * k) * SS, (cy - ry * k + dy) * SS, (cx + rx * k) * SS, (cy + ry * k + dy) * SS]
    d.ellipse(box(0.95), fill=(222, 216, 206, 255))
    d.ellipse([(cx - rx * 0.95) * SS, (cy - ry * 0.95 + ry * 0.4) * SS, (cx + rx * 0.95) * SS, (cy + ry * 0.95) * SS], fill=(208, 201, 190, 255))
    d.ellipse(box(0.97), outline=(255, 255, 255, 255), width=int(rx * 0.05 * SS))
    # حافة القاع الملفوفة: قوس أغمق قليلاً
    d.arc([(cb - rb2) * SS, (y_bot - (bottom - y_bot)) * SS, (cb + rb2) * SS, bottom * SS], 10, 170, fill=(0, 0, 0, 30), width=int(span * 0.012 * SS))
    over = over.resize((w, h), Image.LANCZOS)
    out.alpha_composite(over)
    out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return out


def star(d: ImageDraw.ImageDraw, x: float, y: float, r: float, outline: bool) -> None:
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.28
        pts.append(((x + rr * math.cos(ang)) * SS, (y + rr * math.sin(ang)) * SS))
    d.polygon(pts, fill=GOLD + (255,), outline=(255, 250, 238, 255) if outline else None, width=2 * SS)


def sparkle(img: Image.Image, x: float, y: float, r: float) -> None:
    """لمعة ذهبية (نجمة رباعية كبيرة وأخرى صغيرة) فوق الكوب المجاني"""
    layer = Image.new("RGBA", (img.width * SS, img.height * SS))
    d = ImageDraw.Draw(layer)
    star(d, x, y, r, True)
    star(d, x - r * 1.1, y + r * 1.1, r * 0.45, False)
    img.alpha_composite(layer.resize(img.size, Image.LANCZOS))


def place(cup: Image.Image, k: float = 1.0) -> Image.Image:
    """يضع الكوب في إطار 240×300 مع ظل ناعم أسفله"""
    bbox = cup.getbbox()
    cup = cup.crop(bbox)
    ch = int(H * 0.86 * k)
    cw = round(cup.width * ch / cup.height)
    cup = cup.resize((cw, ch), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H))
    shadow = Image.new("RGBA", (W, H))
    ImageDraw.Draw(shadow).ellipse([W * 0.3, H * 0.895, W * 0.96, H * 0.975], fill=(40, 20, 10, 80))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(6)))
    canvas.alpha_composite(cup, ((W - cw) // 2, int(H * 0.94) - ch))
    return canvas


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = clean_alpha(Image.open(sys.argv[1]).convert("RGBA"))
    filled = place(src)
    # الكوب الأبيض بلا نعناع فوق الحافة، فيُصغَّر قليلاً ليطابق جسم كوب قمرا
    empty = place(white_cup(src), 0.95)
    reward = filled.copy()
    sparkle(reward, W * 0.8, H * 0.14, W * 0.12)
    os.makedirs(OUT, exist_ok=True)
    for name, img in (("filled", filled), ("empty", empty), ("reward", reward)):
        img.save(os.path.join(OUT, f"takeaway-{name}.png"), optimize=True)
        print("wrote", f"takeaway-{name}.png")


if __name__ == "__main__":
    main()
