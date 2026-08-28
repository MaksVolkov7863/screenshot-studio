#!/usr/bin/env python3
"""Generate PNG toolbar icons for СкринСтудия."""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"


def png_encode(width: int, height: int, rgba: bytearray) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def blend(dst: bytearray, x: int, y: int, w: int, r: int, g: int, b: int, a: int) -> None:
    if a <= 0 or x < 0 or y < 0 or x >= w:
        return
    i = (y * w + x) * 4
    if i + 3 >= len(dst):
        return
    da = dst[i + 3] / 255.0
    sa = a / 255.0
    out_a = sa + da * (1 - sa)
    if out_a <= 0:
        return
    dst[i] = int((r * sa + dst[i] * da * (1 - sa)) / out_a)
    dst[i + 1] = int((g * sa + dst[i + 1] * da * (1 - sa)) / out_a)
    dst[i + 2] = int((b * sa + dst[i + 2] * da * (1 - sa)) / out_a)
    dst[i + 3] = int(out_a * 255)


def fill_circle(px, n, cx, cy, rad, color, aa=1.6):
    r, g, b, a = color
    r2 = rad * rad
    minx = max(0, int(cx - rad - 2))
    maxx = min(n - 1, int(cx + rad + 2))
    miny = max(0, int(cy - rad - 2))
    maxy = min(n - 1, int(cy + rad + 2))
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
            if d <= (rad - aa) ** 2:
                blend(px, x, y, n, r, g, b, a)
            elif d <= (rad + aa) ** 2:
                t = (math.sqrt(d) - (rad - aa)) / (2 * aa)
                t = max(0.0, min(1.0, t))
                blend(px, x, y, n, r, g, b, int(a * (1 - t)))


def stroke_circle(px, n, cx, cy, rad, width, color):
    fill_circle(px, n, cx, cy, rad + width / 2, color)
    # punch inner with transparent-over is wrong; redraw inner bg later


def fill_round_rect(px, n, x0, y0, x1, y1, rad, color):
    r, g, b, a = color
    for y in range(n):
        for x in range(n):
            cx = min(max(x + 0.5, x0 + rad), x1 - rad)
            cy = min(max(y + 0.5, y0 + rad), y1 - rad)
            # inside the inner rect
            if x0 + rad <= x + 0.5 <= x1 - rad and y0 + rad <= y + 0.5 <= y1 - rad:
                blend(px, x, y, n, r, g, b, a)
                continue
            if x0 <= x + 0.5 <= x1 and y0 <= y + 0.5 <= y1:
                dx = (x + 0.5) - cx
                dy = (y + 0.5) - cy
                d = math.hypot(dx, dy)
                if d <= rad - 0.6:
                    blend(px, x, y, n, r, g, b, a)
                elif d <= rad + 0.6:
                    t = (d - (rad - 0.6)) / 1.2
                    blend(px, x, y, n, r, g, b, int(a * (1 - t)))


def stroke_round_rect(px, n, x0, y0, x1, y1, rad, width, color):
    fill_round_rect(px, n, x0, y0, x1, y1, rad, color)
    inset = width
    fill_round_rect(
        px,
        n,
        x0 + inset,
        y0 + inset,
        x1 - inset,
        y1 - inset,
        max(0.5, rad - inset),
        (18, 22, 30, 255),
    )


def fill_poly(px, n, pts, color):
    r, g, b, a = color
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = max(0, int(min(xs)) - 1), min(n - 1, int(max(xs)) + 1)
    miny, maxy = max(0, int(min(ys)) - 1), min(n - 1, int(max(ys)) + 1)
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            if _even_odd(x + 0.5, y + 0.5, pts):
                blend(px, x, y, n, r, g, b, a)


def _even_odd(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i, (xi, yi) in enumerate(pts):
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def stroke_line(px, n, x0, y0, x1, y1, width, color):
    r, g, b, a = color
    length = math.hypot(x1 - x0, y1 - y0) or 1
    dx, dy = (x1 - x0) / length, (y1 - y0) / length
    nx, ny = -dy, dx
    hw = width / 2
    pts = [
        (x0 + nx * hw, y0 + ny * hw),
        (x1 + nx * hw, y1 + ny * hw),
        (x1 - nx * hw, y1 - ny * hw),
        (x0 - nx * hw, y0 - ny * hw),
    ]
    fill_poly(px, n, pts, color)
    fill_circle(px, n, x0, y0, hw, color)
    fill_circle(px, n, x1, y1, hw, color)


def draw_icon(n: int) -> bytearray:
    px = bytearray(n * n * 4)
    # transparent outside, rounded tile
    pad = n * 0.06
    fill_round_rect(px, n, pad, pad, n - pad, n - pad, n * 0.22, (16, 20, 28, 255))

    # inner glow disc
    fill_circle(px, n, n * 0.50, n * 0.52, n * 0.34, (255, 106, 61, 42))

    # crop brackets
    accent = (61, 196, 255, 255)
    orange = (255, 106, 61, 255)
    white = (240, 246, 255, 255)
    w = max(2.0, n * 0.055)
    L = n * 0.16
    m = n * 0.18
    # TL
    stroke_line(px, n, m, m + L, m, m, w, accent)
    stroke_line(px, n, m, m, m + L, m, w, accent)
    # TR
    stroke_line(px, n, n - m - L, m, n - m, m, w, accent)
    stroke_line(px, n, n - m, m, n - m, m + L, w, accent)
    # BL
    stroke_line(px, n, m, n - m - L, m, n - m, w, accent)
    stroke_line(px, n, m, n - m, m + L, n - m, w, accent)
    # BR
    stroke_line(px, n, n - m - L, n - m, n - m, n - m, w, accent)
    stroke_line(px, n, n - m, n - m - L, n - m, n - m, w, accent)

    # shutter ring
    cx, cy = n * 0.48, n * 0.50
    fill_circle(px, n, cx, cy, n * 0.26, orange)
    fill_circle(px, n, cx, cy, n * 0.18, (16, 20, 28, 255))
    fill_circle(px, n, cx, cy, n * 0.10, (255, 180, 110, 255))
    fill_circle(px, n, cx, cy, n * 0.045, (16, 20, 28, 255))

    # annotation stroke (pen)
    x0, y0 = n * 0.58, n * 0.70
    x1, y1 = n * 0.84, n * 0.38
    stroke_line(px, n, x0, y0, x1, y1, max(2.2, n * 0.07), white)
    # arrow head
    ang = math.atan2(y1 - y0, x1 - x0)
    ah = n * 0.12
    fill_poly(
        px,
        n,
        [
            (x1, y1),
            (x1 - ah * math.cos(ang - 0.45), y1 - ah * math.sin(ang - 0.45)),
            (x1 - ah * math.cos(ang + 0.45), y1 - ah * math.sin(ang + 0.45)),
        ],
        white,
    )
    return px


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 96, 128):
        data = png_encode(size, size, draw_icon(size))
        path = ROOT / f"icon-{size}.png"
        path.write_bytes(data)
        print("wrote", path, len(data))


if __name__ == "__main__":
    main()
