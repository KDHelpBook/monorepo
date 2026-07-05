#!/usr/bin/env python3
"""Generate a large lorem-ipsum test docset source tree (pages + graphics).

Deterministic (seeded), so re-running produces byte-identical output. Emits the
directory layout `kdhelp compile` expects — docset.toml, categories.yaml,
toc.yaml, pages/*.md, assets/*.{svg,png} — sized big enough (~40 pages, mixed
SVG + PNG graphics) to make page-level streaming savings visible.

Usage:
    python3 gen-lorem.py <out-dir>
Then:
    cargo run -p kdhelp-cli -- compile <out-dir> -o lorem-en.khb
"""
import os
import random
import sys
import struct
import zlib

try:
    from PIL import Image, ImageDraw
    HAVE_PIL = True
except ImportError:  # SVG-only fallback
    HAVE_PIL = False

SEED = 20260705
LOREM = (
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod "
    "tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam "
    "quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo "
    "consequat duis aute irure in reprehenderit voluptate velit esse cillum "
    "eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident "
    "sunt culpa qui officia deserunt mollit anim id est laborum curabitur "
    "pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis "
    "et commodo pharetra est eros suscipit magna imperdiet mauris molestie"
).split()

# Chapters → (id, title, page-slugs). Categories are the facet.
CHAPTERS = [
    ("intro", "Introduction", ["overview", "getting-started", "philosophy"]),
    ("concepts", "Concepts", ["architecture", "data-model", "rendering",
                              "indexing", "streaming"]),
    ("guides", "Guides", ["installation", "configuration", "first-project",
                          "styling", "deployment", "troubleshooting"]),
    ("reference", "Reference", ["cli", "format", "api", "schema", "glossary"]),
    ("gallery", "Gallery", ["figures", "charts", "diagrams", "photos",
                            "mosaics"]),
    ("appendix", "Appendix", ["changelog", "faq", "credits", "license"]),
]

PALETTES = [
    ["#2f5b9c", "#4a86d8", "#a8c8f0", "#f0f5fc"],
    ["#8c3b2f", "#d86a4a", "#f0b8a8", "#fcf2f0"],
    ["#2f8c5b", "#4ad88a", "#a8f0c8", "#f0fcf5"],
    ["#6b2f8c", "#a34ad8", "#d8a8f0", "#f8f0fc"],
    ["#8c7a2f", "#d8c04a", "#f0e6a8", "#fcfaf0"],
]


def rng():
    r = random.Random(SEED)
    return r


def words(r, n):
    return [r.choice(LOREM) for _ in range(n)]


def sentence(r):
    n = r.randint(6, 16)
    s = " ".join(words(r, n))
    return s[0].upper() + s[1:] + r.choice([".", ".", ".", "?", "!"])


def paragraph(r):
    return " ".join(sentence(r) for _ in range(r.randint(3, 6)))


def title_case(slug):
    return " ".join(w.capitalize() for w in slug.split("-"))


# --- graphics ---------------------------------------------------------------

def svg_bars(r, pal):
    vals = [r.randint(20, 100) for _ in range(6)]
    bars = []
    for i, v in enumerate(vals):
        x = 40 + i * 60
        h = int(v * 1.4)
        y = 200 - h
        c = pal[i % 3]
        bars.append(
            f'<rect x="{x}" y="{y}" width="40" height="{h}" rx="3" fill="{c}"/>'
            f'<text x="{x+20}" y="{y-6}" font-size="12" text-anchor="middle" '
            f'fill="#333">{v}</text>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" '
        f'width="420" height="220" font-family="Tahoma, Segoe UI, sans-serif">'
        f'<rect width="420" height="220" fill="{pal[3]}"/>'
        f'<line x1="30" y1="200" x2="410" y2="200" stroke="#999"/>'
        + "".join(bars) + "</svg>")


def svg_flow(r, pal):
    labels = [title_case(r.choice([
        "source-files", "compile", "khb-docset", "viewer", "reader"]))
        for _ in range(4)]
    boxes = []
    for i, lab in enumerate(labels):
        x = 20 + i * 100
        boxes.append(
            f'<rect x="{x}" y="70" width="86" height="50" rx="6" '
            f'fill="{pal[1]}" stroke="{pal[0]}"/>'
            f'<text x="{x+43}" y="100" font-size="11" text-anchor="middle" '
            f'fill="#fff">{lab}</text>')
        if i < 3:
            ax = x + 86
            boxes.append(
                f'<line x1="{ax}" y1="95" x2="{ax+14}" y2="95" '
                f'stroke="{pal[0]}" stroke-width="2" marker-end="url(#a)"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 190" '
        f'width="440" height="190" font-family="Tahoma, Segoe UI, sans-serif">'
        f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M0 0 L10 5 L0 10 z" fill="{pal[0]}"/></marker></defs>'
        f'<rect width="440" height="190" fill="{pal[3]}"/>'
        + "".join(boxes) + "</svg>")


def svg_art(r, pal):
    shapes = []
    for _ in range(18):
        cx, cy = r.randint(0, 400), r.randint(0, 240)
        rad = r.randint(10, 60)
        c = r.choice(pal[:3])
        op = round(r.uniform(0.2, 0.7), 2)
        shapes.append(
            f'<circle cx="{cx}" cy="{cy}" r="{rad}" fill="{c}" '
            f'opacity="{op}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" '
        f'width="400" height="240">'
        f'<rect width="400" height="240" fill="{pal[3]}"/>'
        + "".join(shapes) + "</svg>")


def png_placeholder(path, r, pal, label):
    """A raster 'photo' placeholder: diagonal gradient + shapes + a label."""
    if not HAVE_PIL:
        return False
    w, h = 480, 300
    img = Image.new("RGB", (w, h))
    px = img.load()
    c0 = tuple(int(pal[0][i:i + 2], 16) for i in (1, 3, 5))
    c1 = tuple(int(pal[1][i:i + 2], 16) for i in (1, 3, 5))
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h)
            px[x, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * t) for k in range(3))
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(8):
        x0, y0 = r.randint(0, w), r.randint(0, h)
        rad = r.randint(20, 90)
        col = tuple(int(pal[2][i:i + 2], 16) for i in (1, 3, 5)) + (
            r.randint(40, 130),)
        d.ellipse([x0 - rad, y0 - rad, x0 + rad, y0 + rad], fill=col)
    d.rectangle([0, h - 40, w, h], fill=(0, 0, 0, 110))
    d.text((16, h - 30), label, fill=(255, 255, 255))
    img.save(path, "PNG", optimize=True)
    return True


# --- emit -------------------------------------------------------------------

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    out = sys.argv[1]
    r = rng()
    pages_dir = os.path.join(out, "pages")
    assets_dir = os.path.join(out, "assets")
    os.makedirs(pages_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)

    # docset.toml
    with open(os.path.join(out, "docset.toml"), "w") as f:
        f.write('id = "lorem-en"\n')
        f.write('title = "Lorem Ipsum — Test Docset"\n')
        f.write('version = "1.0.0"\n')
        f.write('language = "en"\n')
        f.write('collection = "lorem"\n')
        f.write('collection_title = "Lorem Ipsum"\n')

    # categories.yaml
    with open(os.path.join(out, "categories.yaml"), "w") as f:
        for cid, ctitle, _ in CHAPTERS:
            f.write(f"- id: {cid}\n  title: {ctitle}\n")

    all_slugs = [s for _, _, slugs in CHAPTERS for s in slugs]
    graphic_kinds = ["bars", "flow", "art", "png"]
    asset_count = 0

    # pages + toc
    toc_lines = []
    for cid, ctitle, slugs in CHAPTERS:
        # a chapter landing page groups its section pages
        landing = f"ch-{cid}"
        toc_lines.append(f"- page: {landing}")
        toc_lines.append("  children:")
        write_page(pages_dir, assets_dir, r, landing,
                   f"{ctitle}", cid, all_slugs, graphic_kinds, force_graphic=True)
        asset_count += 1
        for slug in slugs:
            toc_lines.append(f"    - page: {slug}")
            n = write_page(pages_dir, assets_dir, r, slug,
                           title_case(slug), cid, all_slugs, graphic_kinds)
            asset_count += n

    with open(os.path.join(out, "toc.yaml"), "w") as f:
        f.write("\n".join(toc_lines) + "\n")

    n_pages = len(all_slugs) + len(CHAPTERS)
    print(f"generated {n_pages} pages, {asset_count} graphics -> {out}")


def write_page(pages_dir, assets_dir, r, slug, title, cid, all_slugs,
               kinds, force_graphic=False):
    """Write one page; return how many asset files it produced."""
    pal = PALETTES[r.randrange(len(PALETTES))]
    kw = list(dict.fromkeys(words(r, 6)))[:5]
    related = r.sample([s for s in all_slugs if s != slug], k=3)
    body = [
        "---",
        f"title: {title}",
        f"keywords: [{', '.join(kw)}]",
        f"categories: [{cid}]",
        f"related: [{', '.join(related)}]",
        "---",
        f"# {title}",
        "",
        f"*{sentence(r)}*",
        "",
        paragraph(r),
        "",
    ]

    produced = 0
    n_graphics = r.randint(1, 3) if not force_graphic else 2
    n_sections = r.randint(3, 6)
    for si in range(n_sections):
        body.append(f"## {title_case(' '.join(words(r, r.randint(1, 3))))}")
        body.append("")
        body.append(paragraph(r))
        body.append("")
        # sprinkle a graphic after some sections
        if produced < n_graphics and (force_graphic or r.random() < 0.6):
            kind = r.choice(kinds)
            name = f"{slug}-{produced}.{'png' if kind == 'png' else 'svg'}"
            path = os.path.join(assets_dir, name)
            ok = True
            if kind == "png":
                ok = png_placeholder(path, r, pal, f"{title} · fig {produced+1}")
                if not ok:  # fall back to SVG art if Pillow missing
                    kind, name = "art", f"{slug}-{produced}.svg"
                    path = os.path.join(assets_dir, name)
            if kind == "bars":
                open(path, "w").write(svg_bars(r, pal))
            elif kind == "flow":
                open(path, "w").write(svg_flow(r, pal))
            elif kind == "art":
                open(path, "w").write(svg_art(r, pal))
            body.append(f"![{title} — figure {produced+1}](assets/{name})")
            body.append("")
            produced += 1
        # a list or table now and then
        if r.random() < 0.4:
            for _ in range(r.randint(2, 4)):
                body.append(f"- **{r.choice(LOREM).capitalize()}** — "
                            f"{sentence(r)}")
            body.append("")
        elif r.random() < 0.3:
            body.append("| Key | Value |")
            body.append("|-----|-------|")
            for _ in range(3):
                body.append(f"| {r.choice(LOREM)} | {sentence(r)} |")
            body.append("")

    body.append("> " + paragraph(r))
    body.append("")
    with open(os.path.join(pages_dir, f"{slug}.md"), "w") as f:
        f.write("\n".join(body))
    return produced


if __name__ == "__main__":
    main()
