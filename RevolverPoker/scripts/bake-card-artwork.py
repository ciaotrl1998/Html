"""Bake the existing saloon card style once. The game ships PNGs, not this renderer.

Requires Pillow. Font files are used only on the build computer, never on phones.
Run from any directory: python scripts/bake-card-artwork.py
"""
from pathlib import Path
import hashlib
import json
import math
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'client' / 'assets' / 'cards'
OUT.mkdir(parents=True, exist_ok=True)
RANK_FONT = Path('C:/Windows/Fonts/msyhbd.ttc')
SUIT_FONT = Path('C:/Windows/Fonts/seguisym.ttf')
TITLE_FONT = Path('C:/Windows/Fonts/georgiab.ttf')
RANKS = '23456789TJQKA'
SUITS = ['♣', '♦', '♥', '♠']
SIZE = (384, 558)
UI_SIZE = (132, 173)
PATTERNS = {
    2: [(0, -.4), (0, .4)], 3: [(0, -.4), (0, 0), (0, .4)],
    4: [(-.3, -.4), (.3, -.4), (-.3, .4), (.3, .4)],
    5: [(-.3, -.4), (.3, -.4), (0, 0), (-.3, .4), (.3, .4)],
    6: [(-.3, -.4), (.3, -.4), (-.3, 0), (.3, 0), (-.3, .4), (.3, .4)],
    7: [(-.3, -.4), (.3, -.4), (0, -.2), (-.3, 0), (.3, 0), (-.3, .4), (.3, .4)],
    8: [(-.3, -.4), (.3, -.4), (0, -.2), (-.3, 0), (.3, 0), (0, .2), (-.3, .4), (.3, .4)],
    9: [(-.3, -.42), (.3, -.42), (-.3, -.14), (.3, -.14), (0, 0), (-.3, .14), (.3, .14), (-.3, .42), (.3, .42)],
    10: [(-.3, -.42), (.3, -.42), (0, -.28), (-.3, -.14), (.3, -.14), (-.3, .14), (.3, .14), (0, .28), (-.3, .42), (.3, .42)],
}


def glyph(image, text, center, bounds, font_path, color, inverted=False):
    font = ImageFont.truetype(str(font_path), 256)
    box = font.getbbox(text)
    mask = Image.new('L', (box[2] - box[0], box[3] - box[1]))
    ImageDraw.Draw(mask).text((-box[0], -box[1]), text, font=font, fill=255)
    factor = min(bounds[0] / mask.width, bounds[1] / mask.height)
    mask = mask.resize((max(1, round(mask.width * factor)), max(1, round(mask.height * factor))), Image.Resampling.LANCZOS)
    if inverted:
        mask = mask.transpose(Image.Transpose.ROTATE_180)
    image.paste(color, (round(center[0] - mask.width / 2), round(center[1] - mask.height / 2)), mask)


def face(card):
    suit, rank = SUITS[card // 13], RANKS[card % 13].replace('T', '10')
    ink = '#922e2b' if 13 <= card < 39 else '#202b27'
    image = Image.new('RGB', (512, 744))
    draw = ImageDraw.Draw(image)
    top, bottom = (245, 234, 212), (226, 212, 185)
    for y in range(744):
        draw.line((0, y, 511, y), fill=tuple(round(a + (b - a) * y / 743) for a, b in zip(top, bottom)))
    rng = random.Random(731)
    for _ in range(1600):
        x, y = rng.randrange(512), rng.randrange(744)
        draw.point((x, y), fill=tuple(max(0, c - 5) for c in image.getpixel((x, y))))
    draw.rectangle((17, 17, 494, 726), outline='#c7b58e', width=2)
    corner = Image.new('RGBA', (156, 220))
    glyph(corner, rank, (78, 86), (112 if rank == '10' else 102, 110), RANK_FONT, ink)
    glyph(corner, suit, (78, 179), (67, 67), SUIT_FONT, ink)
    image.paste(corner, (0, 0), corner)
    corner = corner.transpose(Image.Transpose.ROTATE_180)
    image.paste(corner, (356, 524), corner)
    n = card % 13 + 2
    if n == 14:
        glyph(image, suit, (256, 372), (182, 202), SUIT_FONT, ink)
    elif n >= 11:
        draw.rectangle((150, 220, 362, 524), outline=ink, width=4)
        panel = Image.new('RGBA', (200, 152))
        p = ImageDraw.Draw(panel)
        p.polygon([(36, 65), (17, 10), (68, 35), (100, 0), (132, 35), (183, 10), (164, 65)], fill='#ba985a')
        glyph(panel, rank, (100, 110), (80, 70), RANK_FONT, ink)
        image.paste(panel, (156, 220), panel)
        panel = panel.transpose(Image.Transpose.ROTATE_180)
        image.paste(panel, (156, 372), panel)
        glyph(image, suit, (256, 192), (40, 43), SUIT_FONT, ink)
        glyph(image, suit, (256, 552), (40, 43), SUIT_FONT, ink, True)
    else:
        size = 73 if n >= 8 else 86
        for x, y in PATTERNS[n]:
            glyph(image, suit, (256 + x * 240, 372 + y * 400), (size, size), SUIT_FONT, ink, y > 0)
    return image.resize(SIZE, Image.Resampling.LANCZOS)


def back():
    image = Image.new('RGB', (512, 744), '#efe3c9')
    draw = ImageDraw.Draw(image)
    draw.rectangle((22, 22, 490, 722), fill='#473a2c')
    for x in range(-744, 1256, 24):
        draw.line((max(50, x), 50, min(462, x + 644), 694), fill='#65533a', width=1)
    for inset in (35, 46):
        draw.rectangle((inset, inset, 512 - inset, 744 - inset), outline='#c5a76b', width=3)
    draw.ellipse((132, 217, 380, 527), fill='#302a20', outline='#bda16a', width=5)
    glyph(image, '♠', (256, 363), (150, 161), SUIT_FONT, '#d6bc84')
    glyph(image, 'RevolverPoker', (256, 466), (224, 25), TITLE_FONT, '#d6bc84')
    return image.resize(SIZE, Image.Resampling.LANCZOS)


def display_tile(card):
    # Transparent ink only: runtime keeps the existing paper, rounded border and glow.
    image = Image.new('RGBA', UI_SIZE)
    if card == 52:
        ImageDraw.Draw(image).rectangle((10, 10, 122, 163), outline='#b79a6388', width=2)
        glyph(image, '♠', (66, 86), (62, 72), SUIT_FONT, '#d8be86')
    else:
        rank = RANKS[card % 13].replace('T', '10')
        ink = '#9c3034' if 13 <= card < 39 else '#171a18'
        glyph(image, rank, (66, 53), (114, 76), RANK_FONT, ink)
        glyph(image, SUITS[card // 13], (66, 120), (60, 63), SUIT_FONT, ink)
    return image


for path in (RANK_FONT, SUIT_FONT, TITLE_FONT):
    if not path.is_file():
        raise SystemExit(f'Missing offline build font: {path}')
for card in range(52):
    face(card).save(OUT / f'{card:02d}.png', optimize=True)
back().save(OUT / 'back.png', optimize=True)
sheet = Image.new('RGBA', (13 * UI_SIZE[0], 5 * UI_SIZE[1]))
for card in range(53):
    sheet.paste(display_tile(card), ((card % 13) * UI_SIZE[0], (card // 13) * UI_SIZE[1]))
sheet.save(OUT / 'display.png', optimize=True)
manifest = {'cardSize': list(SIZE), 'displayTileSize': list(UI_SIZE), 'suits': SUITS, 'ranks': RANKS,
            'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.glob('*.png'))}}
(OUT / 'manifest.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(f'Baked {len(manifest["files"])} fixed PNGs: {sum(p.stat().st_size for p in OUT.glob("*.png")) / 1024:.0f} KiB')
