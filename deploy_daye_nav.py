#!/usr/bin/env python3
"""daye-nav 发布安全脚本（纯 stdlib）

背景：sites 发布是「整目录覆盖」。dist-linux/database/database.db 曾经是个 8KB 空壳，
上传后线上库被覆盖 → 后端重新初始化，管理员口令回到默认 12345678、站点/图标/自定义设置全丢。
（2026-11-06 07:46 复现一次，靠发布前备份 + /api/panel/backup/recovery 救回。）

所以发布前必须先 `predep`：把线上真实库拉下来放进 dist-linux，再发布。
发布后跑 `verify`：登录 + 数据指纹核对，异常时给出恢复命令。

用法：
    python deploy_daye_nav.py predep     # 备份线上 → 下载 → 抽出 database.db 到 dist-linux
    python deploy_daye_nav.py verify     # 发布后核验（口令可登 / 自定义 JS 指纹 / 站点数）
    python deploy_daye_nav.py verify --auto-restore   # 核验失败时自动用最新备份恢复
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import zipfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(BASE_DIR, "dist-linux")
BACKUP_DIR = os.path.join(BASE_DIR, "_backup")
HOST = "daye-nav.app.workbuddy.host"
SHARECODE = "TBMY3RYXH3"
USER = "admin@sun.cc"
PASS = "Fiery.813"
# 线上自定义 JS / CSS 长度指纹（2026-11-06 恢复后实测），用来判断数据有没有被重置
FINGERPRINT = {"jsContent": 6704, "cssContent": 3507}

import http.client


def api(path, body=None, token=None, timeout=300, raw=False):
    conn = http.client.HTTPSConnection(HOST, timeout=timeout)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-sp-token"] = token
    data = json.dumps(body).encode() if body is not None else None
    conn.request("POST", path + "?sharecode=" + SHARECODE, body=data, headers=headers)
    resp = conn.getresponse()
    payload = resp.read()
    conn.close()
    if raw:
        return resp.status, payload
    try:
        return resp.status, json.loads(payload)
    except Exception:
        return resp.status, {"_raw": payload[:200]}


def login(password=PASS):
    status, body = api("/api/login", {"username": USER, "password": password})
    if status != 200 or not isinstance(body, dict) or body.get("code") != 0:
        return None, body
    return body["data"]["token"], body


def download(name, dest):
    import urllib.parse
    path = ("/api/panel/backup/downloadBackupZIPFile?sharecode=%s&fileName=%s"
            % (SHARECODE, urllib.parse.quote(name)))
    conn = http.client.HTTPSConnection(HOST, timeout=600)
    conn.request("GET", path)
    resp = conn.getresponse()
    with open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh, 256 * 1024)
    conn.close()
    return resp.status, os.path.getsize(dest)


def predep():
    token, _ = login()
    if not token:
        print("[predep] 登录失败：线上口令不是 %s，先人工确认" % PASS)
        return 1
    status, body = api("/api/panel/backup/backup", {}, token, timeout=600)
    if status != 200 or body.get("code") != 0:
        print("[predep] 创建备份失败:", body)
        return 1
    name = body["data"]["fileName"]
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dest = os.path.join(BACKUP_DIR, name)
    status, size = download(name, dest)
    print("[predep] 线上备份 %s -> %s (%d bytes, http=%d)" % (name, dest, size, status))

    with zipfile.ZipFile(dest) as zf:
        members = [n for n in zf.namelist() if n.endswith("database.db")]
        if not members:
            print("[predep] 备份里没有 database.db，终止（不要发布）")
            return 1
        target = os.path.join(DIST, "database", "database.db")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with zf.open(members[0]) as src, open(target + ".tmp", "wb") as dst:
            shutil.copyfileobj(src, dst)
        os.replace(target + ".tmp", target)

    size = os.path.getsize(target)
    conn = sqlite3.connect(target)
    counts = {}
    for table in ("user", "item_card", "item_icon", "micro_app"):
        try:
            counts[table] = conn.execute("select count(*) from %s" % table).fetchone()[0]
        except Exception:
            counts[table] = "n/a"
    conn.close()
    print("[predep] dist-linux/database/database.db <- %d bytes, %s" % (size, counts))
    if size < 64 * 1024:
        print("[predep] 警告：库文件偏小（<64KB），可能是空壳，发布后数据会丢！")
        return 2
    print("[predep] OK，可以发布")
    return 0


def verify(auto_restore=False):
    token, body = login()
    ok = token is not None
    report = {"login": "ok" if ok else "FAIL", "user": USER}
    if not ok:
        report["loginDetail"] = body
    if ok:
        status, body = api("/api/panel/globalSetting/getCustomJsAndCssCode", {}, token)
        data = (body or {}).get("data") or {}
        fp = {k: len(v) for k, v in data.items() if isinstance(v, str)}
        report["custom"] = fp
        report["fingerprintMatch"] = all(fp.get(k) == v for k, v in FINGERPRINT.items())
        status, body = api("/api/panel/proAuth/getStatus", {}, token)
        report["proAuth"] = (body or {}).get("data", {}).get("proExpiration")
    print(json.dumps(report, ensure_ascii=False, indent=1))

    healthy = report["login"] == "ok" and report.get("fingerprintMatch", False)
    if healthy or not auto_restore:
        return 0 if healthy else 1

    print("[verify] 数据异常，尝试用最新线上备份恢复 …")
    token2, _ = login("12345678") or (None, None)
    if not token2:
        print("[verify] 默认口令也登不进，需要人工处理（可从 _backup/*.zip 手动恢复）")
        return 1
    status, body = api("/api/panel/backup/listExisting", {}, token2)
    items = (body or {}).get("data") or []
    if not items:
        print("[verify] 线上没有可用备份")
        return 1
    newest = items[0]["name"]
    status, body = api("/api/panel/backup/recovery", {"fileName": newest}, token2, timeout=600)
    print("[verify] 恢复 %s -> %s" % (newest, json.dumps(body, ensure_ascii=False)[:200]))
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["predep", "verify"])
    parser.add_argument("--auto-restore", action="store_true")
    args = parser.parse_args()
    if args.action == "predep":
        return predep()
    return verify(args.auto_restore)


if __name__ == "__main__":
    sys.exit(main())
