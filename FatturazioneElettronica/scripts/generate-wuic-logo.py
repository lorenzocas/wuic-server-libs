#!/usr/bin/env python3
"""
Genera il logo WUIC per il footer dei report fattura.
Stile coerente col navbar del sito pubblico (wuic-framework.com):
icona bolt + testo WUIC + sottotitolo "wuic-framework.com".

Output: Reports/fatture_inviate/wuic-logo.png (PNG transparent, 360x90 @ 2x ~~ 720x180).
"""
from PIL import Image, ImageDraw, ImageFont
import os

# Dimensioni 2x per resa stampa nitida; il report poi le scala.
W, H = 720, 180
img = Image.new('RGBA', (W, H), (255, 255, 255, 0))
d = ImageDraw.Draw(img)

# Colori coerenti col sito pubblico:
#   primary brand (indigo-500) = #6366F1  → bolt
#   text-900 (gray-900)       = #111827  → "WUIC"
#   text-500 (gray-500)       = #6B7280  → subtitle
INDIGO = (99, 102, 241, 255)
GRAY900 = (17, 24, 39, 255)
GRAY500 = (107, 114, 128, 255)

# Font stack — Calibri Bold (default Win) o Arial Bold.
def load_font(size, bold=True):
    candidates = [
        ('C:/Windows/Fonts/calibrib.ttf' if bold else 'C:/Windows/Fonts/calibri.ttf'),
        ('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf'),
        ('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf'),
    ]
    for f in candidates:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

font_brand = load_font(96, bold=True)
font_subtitle = load_font(28, bold=False)

# Bolt SVG-like polygon (lightning) drawn as filled polygon.
# Centroidi tarati su canvas 720x180; bolt 90px alto a sinistra.
bolt_pts = [
    (75, 30),   # top
    (35, 95),   # bottom-left of upper triangle
    (65, 95),
    (50, 150),  # bottom point
    (105, 75),  # bottom-right
    (80, 75),
    (95, 30),   # back to near top
]
d.polygon(bolt_pts, fill=INDIGO)

# Testo "WUIC"
brand_x = 130
brand_y = 22
d.text((brand_x, brand_y), "WUIC", font=font_brand, fill=GRAY900)

# Sottotitolo "wuic-framework.com"
sub_x = brand_x + 4
sub_y = brand_y + 110
d.text((sub_x, sub_y), "wuic-framework.com", font=font_subtitle, fill=GRAY500)

out = os.path.join(
    os.path.dirname(__file__), '..', 'Reports', 'fatture_inviate', 'wuic-logo.png'
)
out = os.path.normpath(out)
img.save(out, 'PNG', optimize=True)
print(f'logo saved: {out} ({W}x{H})')
