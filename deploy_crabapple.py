#!/usr/bin/env python3
"""crabapple 发布安全脚本（纯 stdlib）

背景：sites 发布是「整目录覆盖」。目录里的 database/database.db 如果是个空壳，
上传后线上库会被覆盖 → 后端重新初始化，管理员口令回到默认、站点/图标/自定义设置全丢。
所以发布前必须先 `predep`：把**旧站（daye-nav）**上真实库拉下来放进新发布目录，再发布。
发布后跑 `verify`：登录 + 数据指纹核对。

用法：
    python deploy_crabapple.py predep    # 从旧站拉库 → crabapple/database/database.db
    python deploy_crabapple.py verify    # 新站核验（口令可登 / 自定义 JS 指纹 / PRO 到期）
    python deploy_crabapple.py verify --auto-restore

可用环境变量覆盖：DIST / FROM_HOST / FROM_CODE / TO_HOST / TO_CODE
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import zipfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get("DIST") or os.path.join(BASE_DIR, "crabapple")
BACKUP_DIR = os.path.join(BASE_DIR, "_backup")

# 数据来源：旧站（改名前的 daye-nav，仍在线上，是唯一可信数据源）
FROM_HOST = os.environ.get("FROM_HOST") or "daye-nav.app.workbuddy.host"
FROM_CODE = os.environ.get("FROM_CODE") or "TBMY3RYXH3"
# 目标：新站（crabapple）。首次发布前 TO_CODE 可能还不知道，predep 用不到。
TO_HOST = os.environ.get("TO_HOST") or "crabapple.app.workbuddy.host"
TO_CODE = os.environ.get("TO_CODE") or ""

USER = "admin@sun.cc"
PASS = "Fiery.813"
# 线上自定义 JS / CSS 长度指纹（2026-11-06 恢复后实测），用来判断数据有没有被重置
FINGERPRINT = {"jsContent": 6704, "cssContent": 3507}

import http.client


def api(host, code, path, body=None, token=None, timeout=300):
    conn = http.client.HTTPSConnection(host, timeout=timeout)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-sp-token"] = token
    data = json.dumps(body).encode() if body is not None else None
    url = path + ("?sharecode=" + code if code else "")
    conn.request("POST", url, body=data, headers=headers)
    resp = conn.getresponse()
    payload = resp.read()
    conn.close()
    try:
        return resp.status, json.loads(payload)
    except Exception:
        return resp.status, {"_raw": payload[:200]}


def login(host, code, password=PASS):
    status, body = api(host, code, "/api/login", {"username": USER, "password": password})
    if status != 200 or not isinstance(body, dict) or body.get("code") != 0:
        return None, body
    return body["data"]["token"], body


def download(host, code, name, dest):
    import urllib.parse
    path = ("/api/panel/backup/downloadBackupZIPFile?sharecode=%s&fileName=%s"
            % (code, urllib.parse.quote(name)))
    conn = http.client.HTTPSConnection(host, timeout=600)
    conn.request("GET", path)
    resp = conn.getresponse()
    with open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh, 256 * 1024)
    conn.close()
    return resp.status, os.path.getsize(dest)


def predep():
    token, _ = login(FROM_HOST, FROM_CODE)
    if not token:
        print("[predep] 旧站登录失败：口令可能不是默认值，先人工确认")
        return 1
    status, body = api(FROM_HOST, FROM_CODE, "/api/panel/backup/backup", {}, token, timeout=600)
    if status != 200 or body.get("code") != 0:
        print("[predep] 创建备份失败:", body)
        return 1
    name = body["data"]["fileName"]
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dest = os.path.join(BACKUP_DIR, name)
    status, size = download(FROM_HOST, FROM_CODE, name, dest)
    print("[predep] 旧站备份 %s -> %s (%d bytes, http=%d)" % (name, dest, size, status))

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
    for table in ("user", "item_card", "micro_app"):
        try:
            counts[table] = conn.execute("select count(*) from %s" % table).fetchone()[0]
        except Exception:
            counts[table] = "n/a"
    conn.close()
    print("[predep] %s <- %d bytes, %s" % (target, size, counts))
    if size < 64 * 1024:
        print("[predep] 警告：库文件偏小（<64KB），可能是空壳，发布后数据会丢！")
        return 2
    print("[predep] OK，可以发布")
    return 0


def verify(auto_restore=False):
    if not TO_CODE:
        print("[verify] 还没配置新站 sharecode，先发布拿到链接再跑")
        return 1
    token, body = login(TO_HOST, TO_CODE)
    ok = token is not None
    report = {"host": TO_HOST, "login": "ok" if ok else "FAIL", "user": USER}
    if not ok:
        report["loginDetail"] = str(body)[:200]
    if ok:
        status, body = api(TO_HOST, TO_CODE, "/api/panel/globalSetting/getCustomJsAndCssCode", {}, token)
        data = (body or {}).get("data") or {}
        fp = {k: len(v) for k, v in data.items() if isinstance(v, str)}
        report["custom"] = fp
        report["fingerprintMatch"] = all(fp.get(k) == v for k, v in FINGERPRINT.items())
        status, body = api(TO_HOST, TO_CODE, "/api/panel/proAuth/getStatus", {}, token)
        report["proAuth"] = (body or {}).get("data", {}).get("proExpiration")
    print(json.dumps(report, ensure_ascii=False, indent=1))

    healthy = report["login"] == "ok" and report.get("fingerprintMatch", False)
    if healthy or not auto_restore:
        return 0 if healthy else 1

    print("[verify] 数据异常，尝试用最新线上备份恢复 …")
    token2, _ = login(TO_HOST, TO_CODE, "12345678")
    if not token2:
        print("[verify] 默认口令也登不进，需要人工处理（可从 _backup/*.zip 手动恢复）")
        return 1
    status, body = api(TO_HOST, TO_CODE, "/api/panel/backup/listExisting", {}, token2)
    items = (body or {}).get("data") or []
    if not items:
        print("[verify] 线上没有可用备份")
        return 1
    newest = items[0]["name"]
    status, body = api(TO_HOST, TO_CODE, "/api/panel/backup/recovery", {"fileName": newest}, token2, timeout=600)
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
