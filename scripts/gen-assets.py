"""يولّد صور الهوية (عنابي وبيج) لبطاقات Apple/Google والموقع.

الاستخدام: python3 scripts/gen-assets.py
- wallet-assets/apple: icon / logo / strip (لوضع النقاط)
- public/stamps/{N}-{k}@{s}x.png: شريط الأختام (N أكواب، k منها مختومة، والأخير مجاني)
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


def stamp_strip(n, k, w, h):
    """شريط بطاقة الأختام: n كوب، المختوم منها k، والخانة الأخيرة هي الكوب المجاني"""
    W, H = w * SS, h * SS
    img = gradient(W, H, BURGUNDY_LIGHT, BURGUNDY_DARK)
    # زخرفة خفيفة: هلال كبير شفاف في الزاوية
    d = ImageDraw.Draw(img)

    slots = n + 1
    rows = 1 if slots <= 7 else 2
    per_row = math.ceil(slots / rows)
    gap = W * 0.022
    max_d = H * (0.62 if rows == 1 else 0.40)
    dia = min(max_d, (W * 0.90 - gap * (per_row - 1)) / per_row)
    vgap = H * 0.06
    lw = max(2, int(dia * 0.045))
    # الاتجاه من اليمين لليسار (عربي): الختم الأول في أقصى اليمين، والمجاني آخر خانة
    for i in range(slots):
        r, col = divmod(i, per_row)
        in_row = per_row if r < rows - 1 else slots - per_row * (rows - 1)
        total = dia * in_row + gap * (in_row - 1)
        x0 = (W - total) / 2
        cy = H / 2 + (r - (rows - 1) / 2) * (dia + vgap)
        cx = W - (x0 + dia / 2 + col * (dia + gap))
        box = [cx - dia / 2, cy - dia / 2, cx + dia / 2, cy + dia / 2]
        gh = dia * 0.52
        if i == n:  # الكوب المجاني
            d.ellipse(box, fill=TAN)
            draw_glass(d, cx, cy - dia * 0.02, gh, BURGUNDY, tea=None, outline=BURGUNDY)
            star(d, cx + dia * 0.27, cy - dia * 0.27, dia * 0.12, BEIGE_LIGHT)
        elif i < k:  # مختوم
            d.ellipse(box, fill=BEIGE)
            draw_glass(d, cx, cy - dia * 0.02, gh, BEIGE_LIGHT, tea=TEA, outline=BURGUNDY)
        else:  # فارغ
            d.ellipse(box, outline=mix(BEIGE, BURGUNDY, 0.45), width=lw)
            faint = mix(BEIGE, BURGUNDY, 0.72)
            draw_glass(d, cx, cy - dia * 0.02, gh, faint, outline=faint)
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


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if img.mode == "RGBA" and img.getextrema()[3][0] == 255:
        img = img.convert("RGB")
    if img.mode == "RGB":
        img = img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(path, optimize=True)


def main():
    apple = ("wallet-assets", "apple")
    for s, px in ((1, 29), (2, 58), (3, 87)):
        save(icon(px), *apple, f"icon{'' if s == 1 else f'@{s}x'}.png")
    for s in (1, 2, 3):
        suffix = "" if s == 1 else f"@{s}x"
        save(logo(50 * s, 50 * s), *apple, f"logo{suffix}.png")
        save(points_strip(375 * s, 123 * s), *apple, f"strip{suffix}.png")

    for n in range(3, 11):
        for k in range(n + 1):
            for s in (1, 2, 3):
                save(stamp_strip(n, k, 375 * s, 123 * s), "public", "stamps", f"{n}-{k}@{s}x.png")

    save(icon(192), "public", "icon-192.png")
    save(circle_logo(660), "public", "google-logo.png")
    save(points_strip(750, 246), "public", "card-hero.png")


if __name__ == "__main__":
    main()
