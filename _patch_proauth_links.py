#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端小补丁（幂等）：把「授权管理」页三个外链统一改成自有官网，并把
「授权官网」按钮文案改成「官网」。

目标文件（dist-linux 与 Windows 两份目录各一份）：
  web/assets/index-BXzdvHjD.js   授权管理组件，三个按钮的 onClick 链接
  web/assets/index-C_ye-PI6.js   主 bundle，中文 i18n 文案（960KB）

历史：
  * 原实现走 useDomainLinks 短链 http://links.sun-panel.top/... → 跳作者站点
  * 后来改到 auth.xuers.dpdns.org 的 /、/compare、/faq
  * 现在按需求统一到 https://store.xuers.dpdns.org/ ：
    「官网」「功能比较」「查看常见问题」三个按钮都打开这个地址

覆盖两种输入状态，保证可重复执行 / 换域名：
  1) 从未打过补丁的原始 i18n 短链写法 M(a(P)(...))
  2) 上一版打过补丁的 auth.xuers 固定 URL

修改前留 .orig 备份；只改中文 locale，其它语言原样保留。
"""

import hashlib
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
TARGET_DIRS = [
    os.path.join(BASE, "dist-linux"),
    os.path.join(BASE, "sun-panel_v2.0.2-beta261101_windows_amd64"),
]
SITE = os.environ.get("STORE_SITE", "https://store.xuers.dpdns.org").rstrip("/")
URL = SITE + "/"

# 授权管理组件：三个按钮的 onClick
LINK_REPLACEMENTS = [
    ('M(a(P)("proAuthSite",!1))', 'M("%s")' % URL),
    ('M(a(P)("funcDescription",!1))', 'M("%s")' % URL),
    ('M(a(P)("proAuthSiteFAQ",!1))', 'M("%s")' % URL),
    ('M("https://auth.xuers.dpdns.org/")', 'M("%s")' % URL),
    ('M("https://auth.xuers.dpdns.org/compare")', 'M("%s")' % URL),
    ('M("https://auth.xuers.dpdns.org/faq")', 'M("%s")' % URL),
]

# 主 bundle 的中文 i18n：只动中文这一处
TEXT_REPLACEMENTS = [
    ('goToSunPanelAuthSite:"授权官网"', 'goToSunPanelAuthSite:"官网"'),
]

FILES = [
    (os.path.join("web", "assets", "index-BXzdvHjD.js"), LINK_REPLACEMENTS),
    (os.path.join("web", "assets", "index-C_ye-PI6.js"), TEXT_REPLACEMENTS),
]


def patch_file(path, replacements):
    if not os.path.exists(path):
        return "skip (missing) %s" % path
    with open(path, encoding="utf-8") as fh:
        src = fh.read()

    orig_path = path + ".orig"
    if not os.path.exists(orig_path):
        with open(orig_path, "w", encoding="utf-8", newline="") as fh:
            fh.write(src)

    out, hits = src, 0
    for old, new in replacements:
        if old in out:
            hits += out.count(old)
            out = out.replace(old, new)

    if out == src:
        return "no-change %s" % os.path.basename(path)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(out)
    return "patched %d hit(s) -> %s (md5 %s)" % (
        hits, os.path.basename(path),
        hashlib.md5(out.encode()).hexdigest()[:8],
    )


if __name__ == "__main__":
    for d in TARGET_DIRS:
        print("[" + os.path.basename(d) + "]")
        for rel, reps in FILES:
            print("  " + patch_file(os.path.join(d, rel), reps))
    sys.exit(0)
