"""يولّد صور الهوية (عنابي وبيج) لبطاقات Apple/Google والموقع.

الاستخدام: python3 scripts/gen-assets.py
- wallet-assets/apple: icon / logo / strip (لوضع النقاط)
- public/stamps/{N}-{k}@{s}x.png (375×144 مقاس Apple storeCard): شريط الأختام (N أكواب، k منها مختومة، والأخير مجاني)
- public: icon-192 / google-logo / card-hero
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # تنعيم الحواف برسم أكبر ثم تصغير

BURGUNDY = (92, 26, 40)
BURGUNDY_LIGHT = (122, 36, 54)
BURGUNDY_DARK = (58, 15, 25)
BEIGE = (234, 219, 196)
BEIGE_LIGHT = (245, 238, 226)
TAN = (200, 169, 126)
TEA = (168, 74, 42)


def mix(a, b, t):
    """لون بين a وb (t=0 يعطي a)؛ بديل الشفافية لأن ImageDraw لا يمزج الألفا"""
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def canvas(w, h, color=(0, 0, 0, 0)):
    return Image.new("RGBA", (w * SS, h * SS), color)


def finish(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def gradient(w, h, top, bottom):
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    return img


def crescent(d, cx, cy, r, color, bg):
    """هلال: دائرة ممتلئة تقطعها دائرة بلون الخلفية"""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    off = r * 0.42
    d.ellipse([cx - r + off, cy - r - off * 0.35, cx + r + off, cy + r - off * 0.35], fill=bg)


def crescent_layer(w, h, cx, cy, r, color):
    """هلال على طبقة شفافة (للرسم فوق تدرج)"""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    off = r * 0.42
    md.ellipse([cx - r + off, cy - r - off * 0.35, cx + r + off, cy + r - off * 0.35], fill=0)
    layer.paste(Image.new("RGBA", (w, h), color + (255,)), (0, 0), mask)
    return layer


def glass_points(cx, cy, h):
    """كوب شاهي (استكانة): ضيق في الوسط، أعرض في الأعلى والأسفل"""
    w_top, w_mid, w_bot = h * 0.62, h * 0.40, h * 0.52
    top, mid, bot = cy - h / 2, cy + h * 0.08, cy + h / 2
    left = [(cx - w_top / 2, top), (cx - w_mid / 2, mid), (cx - w_bot / 2, bot)]
    right = [(cx + w_bot / 2, bot), (cx + w_mid / 2, mid), (cx + w_top / 2, top)]
    return left + right


def draw_glass(d, cx, cy, h, body, tea=None, outline=None, width=0):
    pts = glass_points(cx, cy, h)
    d.polygon(pts, fill=body, outline=outline, width=width)
    if tea:
        # مستوى الشاهي داخل الكوب
        level = cy - h * 0.18
        inner = glass_points(cx, cy, h * 0.80)
        clip = [(x, max(y, level)) for x, y in inner]
        d.polygon(clip, fill=tea)
    # الصحن
    d.rounded_rectangle([cx - h * 0.42, cy + h / 2 + h * 0.03, cx + h * 0.42, cy + h / 2 + h * 0.11], radius=h * 0.04, fill=outline or body)


def star(d, cx, cy, r, color):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=color)


_CUPS = {}


def cup_img(state, px):
    key = (state, px)
    if key not in _CUPS:
        _CUPS[key] = photo_cup(state, size=max(64, px // SS)).resize((px, px), Image.LANCZOS)
    return _CUPS[key]


def stamp_strip(n, k, w, h):
    """شريط بطاقة الأختام (Apple storeCard 375×144): n كوب، المختوم منها k، والخانة الأخيرة هي الكوب المجاني.
    هامش أفقي آمن حتى لا يقص الجوال أطراف الأكواب."""
    W, H = w * SS, h * SS
    img = gradient(W, H, BURGUNDY_LIGHT, BURGUNDY_DARK)
    d = ImageDraw.Draw(img)
    # خط ذهبي رفيع أعلى وأسفل الشريط
    GOLD = (210, 173, 98)
    d.line([(0, H * 0.02), (W, H * 0.02)], fill=mix(GOLD, BURGUNDY, 0.55), width=max(1, SS))
    d.line([(0, H * 0.98), (W, H * 0.98)], fill=mix(GOLD, BURGUNDY, 0.55), width=max(1, SS))

    slots = n + 1
    rows = 1 if slots <= 7 else 2
    per_row = math.ceil(slots / rows)
    safe = W * 0.88
    gap = W * 0.018
    max_d = H * (0.66 if rows == 1 else 0.42)
    dia = min(max_d, (safe - gap * (per_row - 1)) / per_row)
    vgap = H * 0.05
    ring = max(2, int(dia * 0.035))
    for i in range(slots):
        r, col = divmod(i, per_row)
        in_row = per_row if r < rows - 1 else slots - per_row * (rows - 1)
        total = dia * in_row + gap * (in_row - 1)
        x0 = (W - total) / 2
        cy = H / 2 + (r - (rows - 1) / 2) * (dia + vgap)
        # من اليمين لليسار: الختم الأول يمين، والمجاني آخر خانة يسار
        cx = W - (x0 + dia / 2 + col * (dia + gap))
        box = [cx - dia / 2, cy - dia / 2, cx + dia / 2, cy + dia / 2]
        if i == n:
            d.ellipse(box, fill=mix(GOLD, BURGUNDY_DARK, 0.15), outline=(240, 214, 150), width=ring)
            state = "reward"
        elif i < k:
            d.ellipse(box, fill=mix(BURGUNDY_LIGHT, GOLD, 0.18), outline=GOLD, width=ring)
            state = "filled"
        else:
            d.ellipse(box, fill=mix(BURGUNDY, BURGUNDY_DARK, 0.4), outline=mix(BEIGE, BURGUNDY, 0.55), width=ring)
            state = "empty"
        cpx = int(dia * 0.84)
        cup = cup_img(state, cpx)
        if state == "empty":
            alpha = cup.getchannel("A").point(lambda v: int(v * 0.55))
            cup = cup.copy()
            cup.putalpha(alpha)
        img.alpha_composite(cup, (int(cx - cpx / 2), int(cy - cpx / 2 - dia * 0.02)))
    return finish(img, w, h)


def points_strip(w, h):
    W, H = w * SS, h * SS
    img = gradient(W, H, BURGUNDY_LIGHT, BURGUNDY_DARK)
    img = Image.alpha_composite(img, crescent_layer(W, H, int(W * 0.86), int(H * 0.5), int(H * 0.36), BEIGE))
    d = ImageDraw.Draw(img)
    for i in range(3):
        c = mix(BEIGE, BURGUNDY, 0.7 - i * 0.3)
        draw_glass(d, W * (0.10 + i * 0.13), H * 0.52, H * 0.40, c, tea=TEA if i == 2 else None, outline=c)
    return finish(img, w, h)


def icon(size, rounded=True):
    W = size * SS
    img = canvas(size, size)
    d = ImageDraw.Draw(img)
    bg = gradient(W, W, BURGUNDY_LIGHT, BURGUNDY_DARK)
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=W * (0.22 if rounded else 0), fill=255)
    img.paste(bg, (0, 0), mask)
    img = Image.alpha_composite(img, crescent_layer(W, W, int(W * 0.5), int(W * 0.5), int(W * 0.30), BEIGE))
    return finish(img, size, size)


def logo(w, h):
    W, H = w * SS, h * SS
    img = canvas(w, h)
    img = Image.alpha_composite(img, crescent_layer(W, H, int(H * 0.5), int(H * 0.5), int(H * 0.40), BEIGE))
    return finish(img, w, h)


def circle_logo(size):
    W = size * SS
    img = canvas(size, size)
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, W - 1, W - 1], fill=BURGUNDY)
    img = Image.alpha_composite(img, crescent_layer(W, W, int(W * 0.5), int(W * 0.5), int(W * 0.30), BEIGE))
    return finish(img, size, size)


def cup_halfwidth(t, h):
    """نصف عرض الاستكانة عند الارتفاع t (0 أعلى، 1 أسفل): واسعة فوق، ضيقة في الخصر، متوسطة تحت"""
    top, waist, bot = 0.31 * h, 0.20 * h, 0.26 * h
    tw = 0.58
    if t <= tw:
        u = t / tw
        return top + (waist - top) * (1 - math.cos(u * math.pi)) / 2
    u = (t - tw) / (1 - tw)
    return waist + (bot - waist) * (1 - math.cos(u * math.pi)) / 2


def cup_polygon(cx, top, h, steps=80):
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        y = top + t * h
        w = cup_halfwidth(t, h)
        left.append((cx - w, y))
        right.append((cx + w, y))
    return left + right[::-1]


def vgrad_layer(W, H, y0, y1, c0, c1, a0=255, a1=255):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(int(y0), int(y1) + 1):
        t = (y - y0) / max(1, y1 - y0)
        c = mix(c0, c1, t)
        d.line([(0, y), (W, y)], fill=c + (round(a0 + (a1 - a0) * t),))
    return layer


def photo_cup(state, size=256):
    """استكانة شاهي واقعية على صحن (PNG شفاف) بثلاث حالات: empty / filled / reward"""
    W = size * SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    GOLD, GOLD_D = (214, 176, 98), (160, 120, 52)
    cx, top, h = W * 0.5, W * 0.17, W * 0.60

    # ظل الصحن
    sh = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([W * 0.16, W * 0.80, W * 0.84, W * 0.90], fill=(30, 12, 8, 90))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(W * 0.02)))

    # الصحن
    d = ImageDraw.Draw(img)
    sy = top + h
    d.ellipse([W * 0.13, sy - W * 0.045, W * 0.87, sy + W * 0.075], fill=(238, 228, 214, 255))
    d.ellipse([W * 0.15, sy - W * 0.035, W * 0.85, sy + W * 0.055], fill=(250, 245, 238, 255))
    d.ellipse([W * 0.13, sy - W * 0.045, W * 0.87, sy + W * 0.075], outline=GOLD if state != "empty" else (205, 190, 170), width=int(W * (0.012 if state == "reward" else 0.007)))

    poly = cup_polygon(cx, top, h)
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)

    # جسم الزجاج: شفافية خفيفة
    body = Image.new("RGBA", (W, W), (255, 255, 255, 0))
    body.paste(Image.new("RGBA", (W, W), (255, 252, 246, 70)), (0, 0), mask)
    img = Image.alpha_composite(img, body)

    if state != "empty":
        level = top + h * 0.16
        tea = vgrad_layer(W, W, level, top + h, (196, 86, 40), (104, 28, 14), 235, 250)
        m = mask.copy()
        ImageDraw.Draw(m).rectangle([0, 0, W, level], fill=0)
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        layer.paste(tea, (0, 0), m)
        img = Image.alpha_composite(img, layer)
        # سطح الشاهي
        w = cup_halfwidth(0.16, h)
        surf = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(surf).ellipse([cx - w * 0.98, level - W * 0.018, cx + w * 0.98, level + W * 0.018], fill=(222, 136, 78, 240))
        img = Image.alpha_composite(img, surf)

    # انعكاسات الضوء على الزجاج
    hl = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    for i in range(10, 70):
        t = i / 80
        w = cup_halfwidth(t, h)
        y = top + t * h
        hd.ellipse([cx - w * 0.78 - W * 0.012, y - W * 0.012, cx - w * 0.78 + W * 0.012, y + W * 0.012], fill=(255, 255, 255, 120))
    hl = hl.filter(ImageFilter.GaussianBlur(W * 0.006))
    img = Image.alpha_composite(img, hl)

    # حافة الزجاج والإطار
    edge = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.line(poly[: len(poly) // 2], fill=(150, 130, 120, 170), width=int(W * 0.007))
    ed.line(poly[len(poly) // 2 :], fill=(150, 130, 120, 170), width=int(W * 0.007))
    tw = cup_halfwidth(0, h)
    ed.ellipse([cx - tw, top - W * 0.022, cx + tw, top + W * 0.022], outline=GOLD if state != "empty" else (190, 175, 160), width=int(W * 0.010))
    if state != "empty":
        ed.ellipse([cx - tw, top - W * 0.022 + W * 0.012, cx + tw, top + W * 0.022 + W * 0.012], outline=GOLD_D, width=int(W * 0.004))
    img = Image.alpha_composite(img, edge)

    if state == "reward":
        d = ImageDraw.Draw(img)
        star(d, W * 0.80, W * 0.17, W * 0.10, GOLD)
        star(d, W * 0.80, W * 0.17, W * 0.045, (255, 244, 214))
        star(d, W * 0.20, W * 0.30, W * 0.045, GOLD)
    return finish(img, size, size)


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if img.mode == "RGBA" and img.getextrema()[3][0] == 255:
        img = img.convert("RGB")
    if img.mode == "RGB":
        img = img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(path, optimize=True)


def main():
    os.makedirs(os.path.join(ROOT, "public", "library"), exist_ok=True)
    apple = ("wallet-assets", "apple")
    for s, px in ((1, 29), (2, 58), (3, 87)):
        save(icon(px), *apple, f"icon{'' if s == 1 else f'@{s}x'}.png")
    for s in (1, 2, 3):
        suffix = "" if s == 1 else f"@{s}x"
        save(logo(50 * s, 50 * s), *apple, f"logo{suffix}.png")
        save(points_strip(375 * s, 144 * s), *apple, f"strip{suffix}.png")

    for n in range(3, 11):
        for k in range(n + 1):
            for s in (1, 2, 3):
                save(stamp_strip(n, k, 375 * s, 144 * s), "public", "stamps", f"{n}-{k}@{s}x.png")

    for state in ("empty", "filled", "reward"):
        photo_cup(state).save(os.path.join(ROOT, "public", "library", f"photo-{state}.png"), optimize=True)

    save(icon(192), "public", "icon-192.png")
    save(circle_logo(660), "public", "google-logo.png")
    save(points_strip(750, 246), "public", "card-hero.png")


if __name__ == "__main__":
    main()
