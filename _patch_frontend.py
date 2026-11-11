#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端定制补丁（版本无关，幂等）。

目标：把 sun-panel 官方前端 bundle 改造成本项目需要的形态，官方每次出新版本
（chunk 文件名 hash 全变）都能直接重跑，不依赖具体文件名。

补丁项
------
1) token 头 → x-sp-token
   云网关会静默丢弃名为 token 的请求头，必须改名，server.py 再翻译回 token。
   * 全局封装：t.token=t.token||g.token            → t["x-sp-token"]=t["x-sp-token"]||g.token
   * 对象字面量：headers:{token:X}                 → headers:{"x-sp-token":X}
   * 上传头：  "multipart/form-data",token:X       → "multipart/form-data","x-sp-token":X
   注意：data:{token:...} / token:{} 这类非 header 的键不能动。

2) 解锁 PRO（后端仍会返回 expired，前端把 store 直接置为「未过期」）
   * e.value=n.isExpired                           → e.value=!1
   * t.value=!n.isExpired&&n.hideProBadge          → t.value=!0

3) 「系统应用 / 关于」页去掉作者、打赏、交流群等红框内容（3 处 display:none）

4) 授权管理页三个外链统一到自有官网 + 中文文案「授权官网」→「官网」

用法：
    python _patch_frontend.py <目标目录> [<目标目录> ...]
    目标目录需包含 web/assets/*.js
"""

import glob
import hashlib
import os
import re
import sys

STORE_SITE = os.environ.get("STORE_SITE", "https://store.xuers.dpdns.org").rstrip("/")
STORE_URL = STORE_SITE + "/"

# (正则, 替换, 说明) —— 正则保证换版本后 export 别名变化也能命中
GLOBAL_RULES = [
    # 1) token → x-sp-token
    (r"t\.token=t\.token\|\|(\w+)\.token",
     r't["x-sp-token"]=t["x-sp-token"]||\1.token', "axios 拦截器 token 头"),
    (r"headers:\{token:", 'headers:{"x-sp-token":', "headers:{token:}"),
    (r'"multipart/form-data",token:', '"multipart/form-data","x-sp-token":',
     "multipart 上传 token 头"),
    # 2) PRO 解锁
    (r"\.value=n\.isExpired\b", ".value=!1", "PRO store isExpired=false"),
    (r"\.value=!n\.isExpired&&n\.hideProBadge", ".value=!0", "PRO store hideProBadge=true"),
    # 3) 关于页瘦身
    (r'\{\s*style:\{margin:"10px 0",padding:"0 10px"\}\s*\}',
     '{style:{display:"none"}}', "关于页-作者信息行"),
    (r'class:"flex flex-col items-center justify-center text-\[13px\]"',
     'style:{display:"none"}', "关于页-打赏/交流群块"),
    # 只匹配独立变量声明 vt={class:"mt-5"}，避免误伤其它组件按钮栏的 class:"mt-5"
    (r'=\{class:"mt-5"\}', '={style:{display:"none"}}', "关于页-mt-5 块"),
    # 4) 授权外链 + 文案
    (r'M\(\w+\(\w+\)\("proAuthSite",!1\)\)', 'M("%s")' % STORE_URL, "授权-官网"),
    (r'M\(\w+\(\w+\)\("funcDescription",!1\)\)', 'M("%s")' % STORE_URL, "授权-功能比较"),
    (r'M\(\w+\(\w+\)\("proAuthSiteFAQ",!1\)\)', 'M("%s")' % STORE_URL, "授权-常见问题"),
    (r'M\("https://(?:auth|store)\.xuers\.dpdns\.org[^"]*"\)', 'M("%s")' % STORE_URL,
     "授权-旧域名归一"),
    (r'goToSunPanelAuthSite:"授权官网"', 'goToSunPanelAuthSite:"官网"', "文案-授权官网"),
]


def patch_dir(root):
    assets = os.path.join(root, "web", "assets")
    if not os.path.isdir(assets):
        return ["!! %s 缺少 web/assets" % root]
    logs, total = [], 0
    for path in sorted(glob.glob(os.path.join(assets, "*.js"))):
        with open(path, encoding="utf-8", errors="surrogateescape") as fh:
            src = fh.read()
        out, hits = src, []
        for pat, rep, desc in GLOBAL_RULES:
            new, n = re.subn(pat, rep, out)
            if n:
                out = new
                hits.append("%s x%d" % (desc, n))
                total += n
        if out == src:
            continue
        orig = path + ".orig"
        if not os.path.exists(orig):
            with open(orig, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
                fh.write(src)
        with open(path, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
            fh.write(out)
        logs.append("  %-46s %s" % (os.path.basename(path), ", ".join(hits)))
    logs.insert(0, "[%s] 命中 %d 处" % (os.path.basename(root.rstrip("/\\")) or root, total))
    logs.extend(logs and [] or [])
    return logs


def verify_dir(root):
    """补丁后自检：header 里不应再有裸 token 键，PRO 应为已解锁。"""
    assets = os.path.join(root, "web", "assets")
    bad = []
    for path in glob.glob(os.path.join(assets, "*.js")):
        with open(path, encoding="utf-8", errors="surrogateescape") as fh:
            s = fh.read()
        for pat, label in (
            (r"headers:\{token:", "未替换 headers:{token:"),
            (r"t\.token=t\.token\|\|", "未替换 axios 拦截器"),
            (r"\.value=n\.isExpired\b", "PRO store 仍读 isExpired"),
        ):
            if re.search(pat, s):
                bad.append("%s: %s" % (os.path.basename(path), label))
    return bad


if __name__ == "__main__":
    targets = sys.argv[1:] or [os.getcwd()]
    allbad = []
    for d in targets:
        for line in patch_dir(d):
            print(line)
        allbad += verify_dir(d)
    if allbad:
        print("[自检] 仍有 %d 处未通过：" % len(allbad))
        for b in allbad:
            print("  !!", b)
        sys.exit(1)
    print("[自检] 通过：token 头 / PRO 解锁 全部就位")
