#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 sun-panel 品牌改成 crabapple-panel（文本层）。

只改「人会看见的文字」，不动功能性标识：
  * 保留：URL（hslr-s/sun-panel、*.sun-panel.top）、微应用 id（sun-panel-bookmark-conversion）、
    localStorage key（sun-panel-locale）、CSS 类名（sun-panel-toc-sidebar）、事件 id、
    sun_panel_* 变量名、sun_panel_cache 等。
  * 替换：显示文案 Sun-Panel → Crabapple-Panel；SunPanel-Config → Crabapple-Panel-Config。

用法： python _rebrand.py <目录>          # 目录 = dist-linux 或 windows 实例根
      python _rebrand.py <目录> --check  # 只报告不改
"""
import os
import re
import sys

TEXT_EXT = (".js", ".css", ".html", ".json", ".svg", ".txt")

# (正则, 替换, 说明)
RULES = [
    (re.compile(r"Sun-Panel"), "Crabapple-Panel", '显示文案 Sun-Panel -> Crabapple-Panel'),
    (re.compile(r"SunPanel-Config"), "Crabapple-Panel-Config", '导出配置名 SunPanel-Config'),
    (re.compile(r'Sun-Panel.Top'), 'Crabapple-Panel.Top', '关于页站点名'),
]

# 改完之后仍然允许出现的 sun-panel（功能性标识 / 上游链接）
ALLOW = [
    r"sun-panel\.top",                # 上游域名
    r"hslr-s/sun-panel",              # github
    r"gitee\.com/hslr/sun-panel",
    r"hub\.docker\.com/r/hslr/sun-panel",
    r"sun-panel-bookmark-conversion",  # 微应用 id
    r"sun-panel-locale",              # localStorage key
    r"sun-panel-system-",             # 事件/通道前缀
    r"sun-panel-network-switch-test",  # 探测 id
    r"sun-panel-toc-sidebar",         # 类名
    r"sun_panel[a-z_]*",              # 变量/缓存键
    r"sunpanel",                      # 类名/标识
]


def iter_files(root):
    web = os.path.join(root, "web")
    for dp, dns, fns in os.walk(web):
        dns[:] = [d for d in dns if d not in ("_patched_orig", "node_modules")]
        for f in fns:
            if f.endswith(TEXT_EXT):
                yield os.path.join(dp, f)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "dist-linux"
    check = "--check" in sys.argv
    changed = []
    total = 0
    for path in iter_files(root):
        try:
            src = open(path, encoding="utf-8", errors="surrogateescape").read()
        except Exception:
            continue
        out = src
        n = 0
        for rx, rep, _ in RULES:
            out, k = rx.subn(rep, out)
            n += k
        if n:
            total += n
            changed.append((os.path.relpath(path, root), n))
            if not check:
                open(path, "w", encoding="utf-8", errors="surrogateescape", newline="").write(out)

    print("%s %d 个文件，共 %d 处替换" % ("[check]" if check else "[done]", len(changed), total))
    for p, n in changed:
        print("   %4d  %s" % (n, p))

    # 残留体检：把「可能是人看到的」sun-panel 打印出来
    leftovers = []
    for path in iter_files(root):
        s = open(path, encoding="utf-8", errors="surrogateescape").read()
        for m in re.finditer(r"[Ss]un[-_][Pp]anel|[Ss]un[Pp]anel", s):
            seg = s[max(0, m.start() - 30): m.end() + 30].replace("\n", " ")
            leftovers.append((os.path.relpath(path, root), seg))
    # 逐条剔除允许项
    allow_pat = re.compile("|".join(ALLOW), re.I)
    bad = []
    for p, seg in leftovers:
        hit = allow_pat.search(seg)
        if not hit:
            bad.append((p, seg))
    print("\n残留 sun-panel 命中 %d 处，其中白名单外 %d 处：" % (len(leftovers), len(bad)))
    seen = set()
    for p, seg in bad:
        k = (p, re.sub(r"\d+", "N", seg))
        if k in seen:
            continue
        seen.add(k)
        print("   [%s] %s" % (p, seg))
    return 0


if __name__ == "__main__":
    sys.exit(main())
