#!/usr/bin/env python3
"""Render the VisualTalk concept-5 app icon to a 1024x1024 RGBA PNG.

Why this exists
---------------
``src/assets/logo.svg`` is the design source of truth, but neither this machine
nor CI has an SVG rasterizer that preserves alpha: ``qlmanage`` composites onto
an opaque white background, which baked white corners into every generated icon
asset (icon.png / .icns / .ico).  This script re-implements the exact geometry
of concept 5 in pure-stdlib python so icon regeneration stays deterministic and
dependency-free (no cairosvg / rsvg / imagemagick / chrome required).

Geometry (512x512 user units, mirrors src/assets/logo.svg):
  * rounded square   rx=96, diagonal gradient #8b5cf6 -> #ec4899
  * white camera     rect(112,192, 208x128, rx=32) + lens triangle
  * gradient dot     circle(160,256, r=24), painted on top of the camera

Edges are anti-aliased with a 3x3 supersample grid; pixels outside the rounded
square are fully transparent (alpha 0), never white.

Usage
-----
    python3 scripts/render-icon.py [OUT.png]     # default: /tmp/logo-clean.png

Full icon regeneration workflow:
    python3 scripts/render-icon.py /tmp/logo-clean.png
    pnpm tauri icon /tmp/logo-clean.png
"""
import struct
import sys
import zlib

N = 1024          # output pixels
S = N / 512.0     # user units -> px
K = 3             # supersample grid per axis

PURPLE = (139, 92, 246)   # #8b5cf6
PINK = (236, 72, 153)     # #ec4899

# lens triangle of the camera glyph, in user units
TRI = ((320, 224), (400, 184), (400, 328), (320, 288))


def lerp(c0, c1, t):
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return (c0[0] + (c1[0] - c0[0]) * t,
            c0[1] + (c1[1] - c0[1]) * t,
            c0[2] + (c1[2] - c0[2]) * t)


def in_rrect(x, y, ox, oy, w, h, r):
    cx, cy = ox + w / 2.0, oy + h / 2.0
    ax, ay = abs(x - cx), abs(y - cy)
    if ax > w / 2.0 or ay > h / 2.0:
        return False
    dx = ax - (w / 2.0 - r)
    dy = ay - (h / 2.0 - r)
    if dx > 0 and dy > 0:
        return dx * dx + dy * dy <= r * r
    return True


def in_tri(x, y):
    ok = True
    for i in range(4):
        ax, ay = TRI[i]
        bx, by = TRI[(i + 1) % 4]
        ok = ok and ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) >= 0
    return ok


def in_circle(x, y):
    dx, dy = x - 160, y - 256
    return dx * dx + dy * dy <= 24 * 24


def sample(x, y):
    """Return rgba (0..255) for a point in user units, or None if outside."""
    if not in_rrect(x, y, 0, 0, 512, 512, 96):
        return None
    if in_circle(x, y):
        t = ((x - 136) + (y - 232)) / 96.0
        c = lerp(PURPLE, PINK, t)
        return (int(c[0] + 0.5), int(c[1] + 0.5), int(c[2] + 0.5), 255)
    if in_rrect(x, y, 112, 192, 208, 128, 32) or in_tri(x, y):
        return (255, 255, 255, 255)
    t = (x + y) / 1024.0
    c = lerp(PURPLE, PINK, t)
    return (int(c[0] + 0.5), int(c[1] + 0.5), int(c[2] + 0.5), 255)


def chunk(typ, data):
    c = struct.pack('>I', len(data)) + typ + data
    return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)


def render():
    rows = []
    step = 1.0 / K
    for py in range(N):
        row = bytearray()
        for px in range(N):
            r = g = b = a = 0
            for j in range(K):
                uy = (py + (j + 0.5) * step) / S
                for i in range(K):
                    ux = (px + (i + 0.5) * step) / S
                    s = sample(ux, uy)
                    if s:
                        r += s[0]
                        g += s[1]
                        b += s[2]
                        a += s[3]
            n = K * K
            if a == 0:
                row += b'\x00\x00\x00\x00'
            else:
                row += bytes((int(r / n + 0.5), int(g / n + 0.5),
                              int(b / n + 0.5), int(a / n + 0.5)))
        rows.append(bytes(row))

    raw = b''.join(b'\x00' + r for r in rows)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def main(argv):
    out = argv[1] if len(argv) > 1 else '/tmp/logo-clean.png'
    png = render()
    with open(out, 'wb') as f:
        f.write(png)
    print('wrote %s (%d bytes, %dx%d RGBA)' % (out, len(png), N, N))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
