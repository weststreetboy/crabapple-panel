#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把海棠花 logo 做成面板要用的图标集（去白底 + 裁切 + 多尺寸）。

产出（写到 <web>/ 下）：
  logo.png          512x512 透明背景（首页大字左侧的品牌标）
  favicon.ico       16/32/48/64/128/256 多尺寸（浏览器标签）
  favicon.svg       内嵌 base64 PNG，路径不变，老引用不用改
  favicon-black.svg 同图（浅色主题变体）

用法： python _make_logo.py <web目录> <源图>
"""
import base64
import io
import os
import sys

from PIL import Image

BOX = (16, 32, 48, 64, 128, 256)


def cutout(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            m = min(r, g, b)
            if m >= 250:
                a = 0
            elif m <= 235:
                a = 255
            else:
                a = int((250 - m) * 255 / 15)
            po[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    return out


def square(im, size):
    """等比缩放后放进正方画布（留 4% 边距）。"""
    side = int(size * 0.92)
    w, h = im.size
    k = min(side / w, side / h)
    im2 = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im2, ((size - im2.width) // 2, (size - im2.height) // 2), im2)
    return canvas


def main():
    web = sys.argv[1] if len(sys.argv) > 1 else "dist-linux/web"
    src = sys.argv[2]
    base = cutout(src)
    print("源图去底裁切后 %dx%d" % base.size)

    logo = square(base, 512)
    logo.save(os.path.join(web, "logo.png"), optimize=True)
    print("logo.png 512x512")

    ico = square(base, 256)
    ico.save(os.path.join(web, "favicon.ico"), sizes=[(s, s) for s in BOX])
    print("favicon.ico sizes=%s" % (BOX,))

    png128 = square(base, 128)
    buf = io.BytesIO()
    png128.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" '
        'aria-label="crabapple panel">\n'
        '  <image width="128" height="128" href="data:image/png;base64,%s"/>\n'
        "</svg>\n" % b64
    )
    for name in ("favicon.svg", "favicon-black.svg"):
        open(os.path.join(web, name), "w", encoding="utf-8", newline="").write(svg)
    print("favicon.svg / favicon-black.svg 内嵌 %d bytes png" % len(buf.getvalue()))

    # 预览图：白底和深色底各一张，方便肉眼确认
    for bg, tag in (((255, 255, 255), "light"), ((18, 18, 18), "dark")):
        prev = Image.new("RGB", (512, 512), bg)
        prev.paste(square(base, 480), (16, 16), square(base, 480))
        prev.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "_logo_preview_%s.png" % tag))
    print("预览：_logo_preview_light.png / _logo_preview_dark.png")


if __name__ == "__main__":
    main()
