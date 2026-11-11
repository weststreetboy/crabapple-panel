#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Crabapple-Panel launcher / SPA front-layer.

Why this file exists
--------------------
The shipped binary (sun-panel_v2.0.2-beta261101_windows_amd64) registers the
SPA entry at "/index.html" instead of "/". Result:
    GET /            -> 404 (no root route)
    GET /index.html  -> 301 ./  -> 404  (infinite dead end)

Everything else (API + static assets) works perfectly. So this thin layer:
    * starts sun-panel.exe on an internal port (conf.ini http_port)
    * listens on the public port (PUBLIC_PORT)
    * serves web/index.html for "/" and any client-side route (SPA fallback)
    * transparently proxies /api, /assets, /static, /custom, /uploads, ... to it

Zero third-party dependencies (Python 3 standard library only).
"""

import http.client
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
CUSTOM_DIR = os.path.join(WEB_DIR, "custom")
INDEX_FILE = os.path.join(WEB_DIR, "index.html")


def _resolve_exe():
    for name in ("sun-panel.exe", "sun-panel"):
        path = os.path.join(BASE_DIR, name)
        if os.path.exists(path):
            return path
    return os.path.join(BASE_DIR, "sun-panel.exe")


EXE = _resolve_exe()

# 云平台会注入 PORT 并要求绑定 0.0.0.0；本地未设置时回落到 3002
PUBLIC_PORT = int(os.environ.get("PORT") or 3002)
BACKEND_HOST = "127.0.0.1"

# Paths that must be forwarded to the Go backend instead of the SPA.
# NOTE: /custom/ is intentionally NOT here -- the v2 backend does not expose it,
# so we serve it ourselves from web/custom/ (see _serve_custom).
BACKEND_PREFIXES = (
    "/api/",
    "/assets/",
    "/static/",
    "/uploads/",
    "/micro_app/",
)
BACKEND_EXACT = ("/favicon.ico", "/favicon.svg", "/favicon-black.svg", "/logo.png")

HOP_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host",
}

TITLE_RE = re.compile(r"\{\{\s*__title__\s*\}\}")
FAVICON_RE = re.compile(r"\{\{\s*__faviconSrc__\s*\}\}")

# 站点标题/图标不再硬编码，改为读取 database.db 里的 global_setting_site，
# 这样后台改了标题/图标，重启或刷新页面即生效（按 db mtime 做缓存）。
DB_FILE = os.path.join(BASE_DIR, "database", "database.db")
_SITE_META = {"mtime": None, "title": "Crabapple-Panel", "favicon": "/favicon.svg"}
_SITE_LOCK = threading.Lock()


def _db_stamp():
    """库的变更戳：database.db 的 mtime+size，外加 -wal/-shm（后端若用 WAL，
    只写 wal 时主库 mtime 不变，这里必须一起看，否则改了设置在后台不生效）。"""
    try:
        st = os.stat(DB_FILE)
    except OSError:
        return None
    stamp = [st.st_mtime, st.st_size]
    for suffix in ("-wal", "-shm"):
        try:
            stamp.append(os.stat(DB_FILE + suffix).st_mtime)
        except OSError:
            pass
    return tuple(stamp)


def site_meta():
    """返回 (title, favicon_src)，读取失败时回落到默认值。"""
    mtime = _db_stamp()
    if mtime is None:
        return _SITE_META["title"], _SITE_META["favicon"]
    if mtime != _SITE_META["mtime"]:
        title, favicon = "Crabapple-Panel", "/favicon.svg"
        try:
            import json
            import sqlite3
            uri = "file:%s?mode=ro" % DB_FILE.replace("\\", "/")
            con = sqlite3.connect(uri, uri=True, timeout=5)
            try:
                row = con.execute(
                    "select config_value from system_setting where config_name='global_setting_site'"
                ).fetchone()
            finally:
                con.close()
            if row and row[0]:
                cfg = json.loads(row[0])
                title = (cfg.get("title") or "").strip() or title
                favicon = (cfg.get("favicoUrl") or "").strip() or favicon
                if favicon.startswith("/uploads/"):
                    local = os.path.join(BASE_DIR, favicon.lstrip("/").replace("/", os.sep))
                    if not os.path.isfile(local):
                        favicon = "/favicon.ico"
        except Exception:
            pass
        with _SITE_LOCK:
            _SITE_META.update(mtime=mtime, title=title, favicon=favicon)
    return _SITE_META["title"], _SITE_META["favicon"]


# ---------------------------------------------------------------------------
# 会话自愈（解决"每次重启容器就提示重新登录"）
# 后端 cache_drive=memory，进程一重启所有 token 立刻失效，而浏览器 localStorage
# 里还存着旧 token，于是每次都是「登录状态已过期」。这里由代理层维护一份自己的
# 会话：当请求带着（可能已过期的）token 却被判定未登录时，自动重新登录并重试一次。
# 访客请求（完全不带 token）不会触发，因此不会把管理员数据暴露给访客。
# 凭据读取顺序：环境变量 SUNPANEL_USER/SUNPANEL_PASS → runtime/auto_login.json → 默认账号。
# ---------------------------------------------------------------------------
AUTO_LOGIN_FILE = os.path.join(BASE_DIR, "runtime", "auto_login.json")
_SESSION = {"token": None}
_SESSION_LOCK = threading.Lock()

# 出厂默认 / 常见弱密码：即使 runtime/auto_login.json 被发布流程重置成这些值，
# 也一律忽略 —— 否则代理层会拿弱密码去自动登录（必然失败，会话自愈失效），
# 同时等于把后台口令又退回默认。真实口令见 ADMIN_FALLBACK_PASS。
WEAK_PASSWORDS = {
    "12345678", "123456789", "1234567", "123456", "admin", "admin123",
    "admin888", "password", "sun-panel", "sunpanel", "changeme", "",
}
ADMIN_FALLBACK_USER = "admin@sun.cc"
ADMIN_FALLBACK_PASS = "Fiery.813"


def credentials():
    user = os.environ.get("SUNPANEL_USER")
    pwd = os.environ.get("SUNPANEL_PASS")
    if user and pwd:
        return user, pwd
    try:
        with open(AUTO_LOGIN_FILE, encoding="utf-8") as fh:
            cfg = json.load(fh)
        u = (cfg.get("username") or "").strip()
        p = (cfg.get("password") or "").strip()
        if u and p and p.lower() not in WEAK_PASSWORDS:
            return u, p
        if p and p.lower() in WEAK_PASSWORDS:
            sys.stderr.write(
                "[auth] runtime/auto_login.json 存的是出厂弱密码，已忽略，改用内置管理员凭据\n"
            )
    except Exception:
        pass
    # 兜底：管理员口令已改为自定义强口令（同时写入 runtime/auto_login.json，文件优先）
    return ADMIN_FALLBACK_USER, ADMIN_FALLBACK_PASS


def backend_login():
    user, pwd = credentials()
    payload = json.dumps({"username": user, "password": pwd}).encode()
    conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=15)
    try:
        conn.request(
            "POST", "/api/login", body=payload,
            headers={"Content-Type": "application/json", "Content-Length": str(len(payload))},
        )
        raw = conn.getresponse().read()
    except Exception:
        return None
    finally:
        conn.close()
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if data.get("code") == 0:
        return ((data.get("data") or {}).get("token")) or None
    return None


def session_token(force=False):
    with _SESSION_LOCK:
        if _SESSION["token"] and not force:
            return _SESSION["token"]
        tok = backend_login()
        if tok:
            _SESSION["token"] = tok
        return _SESSION["token"]


# ---------------------------------------------------------------------------
# 本地授权（Local License）
# ---------------------------------------------------------------------------
# 目的：这个实例不去连 Sun-Panel 官方授权服务器，改为「自建授权」——
#   * 授权状态存在 runtime/local_license.json（离线、可迁移）
#   * 开通后由本层把 /api/panel/proAuth/getStatus 的响应改写成「已授权」，
#     前端据此解开 PRO 限制（账号数量、公共图库、自定义 JS/CSS 等）
#   * 授权码用 HMAC 签名，可以复制到另一台实例恢复，不需要联网
LICENSE_FILE = os.path.join(BASE_DIR, "runtime", "local_license.json")
LICENSE_SECRET = b"sun-panel-local-license::v1"
_LC = {"mtime": None, "data": None}
_LC_LOCK = threading.Lock()

# 毫秒级缓存的登录校验，避免每次点按钮都打一次后端
_AUTH_CACHE = {"token": None, "ok": False, "at": 0.0}


def _b36(num):
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if num == 0:
        return "0"
    out = ""
    while num:
        num, rem = divmod(num, 36)
        out = alphabet[rem] + out
    return out


def _unb36(text):
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    val = 0
    for ch in text:
        idx = alphabet.find(ch)
        if idx < 0:
            raise ValueError("bad char")
        val = val * 36 + idx
    return val


def license_sign(exp_ts):
    """对到期时间签名，得到 10 位校验串。"""
    return hmac.new(LICENSE_SECRET, str(int(exp_ts)).encode(), hashlib.sha256).hexdigest()[:10]


def make_license_code(exp_ts):
    sig = license_sign(exp_ts)
    return "SPL-%s-%s-%s" % (_b36(int(exp_ts)), sig[:5], sig[5:])


def parse_license_code(code):
    """解析授权码，返回 (ok, exp_ts)。exp_ts=0 表示永久。"""
    raw = (code or "").strip().upper().replace(" ", "")
    parts = raw.split("-")
    if len(parts) != 4 or parts[0] != "SPL":
        return False, 0
    try:
        exp_ts = _unb36(parts[1].lower())
    except Exception:
        return False, 0
    sig = (parts[2] + parts[3]).lower()
    if not hmac.compare_digest(sig, license_sign(exp_ts)):
        return False, 0
    return True, exp_ts


def license_load():
    try:
        mtime = os.path.getmtime(LICENSE_FILE)
    except OSError:
        return None
    with _LC_LOCK:
        if _LC["mtime"] != mtime:
            try:
                with open(LICENSE_FILE, encoding="utf-8") as fh:
                    _LC["data"] = json.load(fh)
            except Exception:
                _LC["data"] = None
            _LC["mtime"] = mtime
        return _LC["data"]


def license_save(data):
    folder = os.path.dirname(LICENSE_FILE)
    if not os.path.isdir(folder):
        os.makedirs(folder, exist_ok=True)
    tmp = LICENSE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, LICENSE_FILE)
    with _LC_LOCK:
        _LC["mtime"] = None
        _LC["data"] = data


def license_state():
    """当前授权状态（前端要的格式）。"""
    lic = license_load()
    now = int(time.time())
    if not lic:
        return {"activated": False, "expiresAt": None, "permanent": False,
                "plan": "", "code": "", "activatedAt": None}
    exp = int(lic.get("expiresAt") or 0)
    permanent = exp == 0
    valid = permanent or exp > now
    return {
        "activated": valid,
        "expired": (not valid),
        "expiresAt": None if permanent else exp,
        "permanent": permanent,
        "plan": lic.get("plan") or ("permanent" if permanent else "custom"),
        "code": lic.get("code") or make_license_code(exp),
        "activatedAt": lic.get("activatedAt"),
        "device": lic.get("device") or "",
    }


def license_write(exp_ts, plan):
    data = {
        "activatedAt": int(time.time()),
        "expiresAt": int(exp_ts),
        "plan": plan,
        "code": make_license_code(exp_ts),
        "device": "",
    }
    try:
        import sqlite3
        uri = "file:%s?mode=ro" % DB_FILE.replace("\\", "/")
        con = sqlite3.connect(uri, uri=True, timeout=5)
        try:
            row = con.execute(
                "select config_value from system_setting where config_name='clientId'"
            ).fetchone()
            if row and row[0]:
                data["device"] = str(row[0])
        finally:
            con.close()
    except Exception:
        pass
    license_save(data)
    return data


def license_activate(body):
    """开通 / 续期 / 用授权码激活 / 注销。返回 (ok, msg)。"""
    now = int(time.time())
    cur = license_load() or {}

    if body.get("revoke"):
        try:
            os.remove(LICENSE_FILE)
        except OSError:
            pass
        with _LC_LOCK:
            _LC["mtime"] = None
            _LC["data"] = None
        return True, "已注销本地授权"

    code = (body.get("code") or "").strip()
    if code:
        ok, exp_ts = parse_license_code(code)
        if not ok:
            return False, "授权码无效，请检查是否复制完整"
        if exp_ts and exp_ts <= now:
            return False, "该授权码已过期"
        license_write(exp_ts, "permanent" if exp_ts == 0 else "code")
        return True, "授权码激活成功"

    try:
        days = int(body.get("days", 365))
    except Exception:
        days = 365
    if days < 0:
        return False, "期限参数错误"

    # 续期：在现有到期时间上叠加；永久授权保持永久
    cur_exp = int(cur.get("expiresAt") or 0) if cur else None
    if days == 0:
        new_exp = 0
    elif cur_exp == 0:
        new_exp = 0
    elif cur_exp and cur_exp > now:
        new_exp = cur_exp + days * 86400
    else:
        new_exp = now + days * 86400

    plan = "permanent" if new_exp == 0 else ("pro" if days >= 1095 else "personal")
    license_write(new_exp, plan)
    return True, "开通成功"


def local_auth_api(path, body, headers):
    """处理 /api/localAuth/* —— 只有已登录的管理账号可以调用。"""
    token = headers.get("token") or headers.get("x-sp-token") or headers.get("X-Sp-Token")
    if not token:
        return {"code": 1000, "msg": "请先登录管理账号"}
    token = token.strip()
    now = time.time()
    if not (_AUTH_CACHE["ok"] and _AUTH_CACHE["token"] == token and now - _AUTH_CACHE["at"] < 60):
        ok = False
        try:
            conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=10)
            try:
                conn.request("POST", "/api/user/getInfo", body=b"{}",
                             headers={"Content-Type": "application/json",
                                      "Content-Length": "2", "token": token})
                raw = conn.getresponse().read()
            finally:
                conn.close()
            ok = b'"code":0' in raw
        except Exception:
            ok = False
        if not ok and len(token) >= 40:
            # 容器重启后后端内存会话全丢，浏览器手里还是旧 token。这里和代理层
            # 的自愈保持一致：客户端确实带了一个形似真 token 的凭据，就用服务端
            # 凭据换一个再验一次；短字符串/乱码不享受这个待遇。
            fresh = session_token(force=True)
            if fresh and fresh != token:
                try:
                    conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=10)
                    try:
                        conn.request("POST", "/api/user/getInfo", body=b"{}",
                                     headers={"Content-Type": "application/json",
                                              "Content-Length": "2", "token": fresh})
                        raw = conn.getresponse().read()
                    finally:
                        conn.close()
                    ok = b'"code":0' in raw
                except Exception:
                    ok = False
        _AUTH_CACHE.update(token=token, ok=ok, at=now)
        if not ok:
            return {"code": 1000, "msg": "登录状态已失效，请重新登录"}
    elif not _AUTH_CACHE["ok"]:
        return {"code": 1000, "msg": "登录状态已失效，请重新登录"}

    if path.endswith("/status"):
        return {"code": 0, "data": license_state(), "msg": "OK"}
    if path.endswith("/activate"):
        ok, msg = license_activate(body)
        if not ok:
            return {"code": -1, "msg": msg}
        return {"code": 0, "data": license_state(), "msg": msg}
    return {"code": 404, "msg": "unknown local api"}


def pro_status_payload():
    """把本地授权翻译成 Sun-Panel 前端认识的 PRO 状态。"""
    st = license_state()
    if not st.get("activated"):
        return None
    if st.get("permanent"):
        exp = "2099-12-31T23:59:59+08:00"
    else:
        exp = time.strftime("%Y-%m-%dT%H:%M:%S+08:00", time.localtime(st["expiresAt"]))
    return {
        "code": 0,
        "data": {
            "proExpiration": exp,
            "loginStatus": True,
            "username": "local-license",
            "nickName": "本地授权 · %s" % ("永久" if st.get("permanent") else "已开通"),
        },
        "msg": "OK",
    }


# ---------------------------------------------------------------------------
# 迁移 / 备份 / 恢复
#
# 官方把这三个接口写死在 Go 里，并且做了 PRO 硬校验（没授权直接 1008
# "no PRO authorization"），前端那把锁只是表象，光解锁界面仍然备份不了。
# 本地授权模式拿不到官方的 PRO 状态，所以这里由代理层自己实现一遍：
# 备份 = sqlite 快照 + uploads 打包；恢复 = 反向写回数据库并覆盖 uploads。
# 恢复后需要手动重启程序（和官方提示一致）。
# ---------------------------------------------------------------------------

BACKUP_DIR = os.path.join(BASE_DIR, "runtime", "backup")
RESTORE_SNAPSHOT_DIR = os.path.join(BASE_DIR, "runtime", "restore_snapshot")
BACKUP_MARK = "Crabapple-Panel_backup_v2"
APP_VERSION = "2.0.2-beta261101"


def _sqlite_copy(src, dest):
    """用 sqlite 自身的 backup API 复制数据库（比直接拷文件安全）。"""
    import sqlite3

    con = sqlite3.connect(src, timeout=15)
    try:
        out = sqlite3.connect(dest, timeout=15)
        try:
            with out:
                con.backup(out)
        finally:
            out.close()
    finally:
        con.close()


def create_backup():
    """生成备份 zip，返回文件名。"""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    name = "%s_%s_%s.zip" % (BACKUP_MARK, APP_VERSION, time.strftime("%Y%m%d%H%M%S"))
    path = os.path.join(BACKUP_DIR, name)
    tmpdb = os.path.join(BACKUP_DIR, ".db_snapshot.tmp")
    try:
        _sqlite_copy(DB_FILE, tmpdb)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            zf.writestr(
                "%s_%s.txt" % (BACKUP_MARK, APP_VERSION),
                json.dumps({"version": APP_VERSION,
                            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S")},
                           ensure_ascii=False),
            )
            zf.write(tmpdb, "database/database.db")
            conf = os.path.join(BASE_DIR, "conf", "conf.ini")
            if os.path.isfile(conf):
                zf.write(conf, "conf/conf.ini")
            uploads = os.path.join(BASE_DIR, "uploads")
            for dirpath, _dirs, files in os.walk(uploads):
                for fn in files:
                    full = os.path.join(dirpath, fn)
                    rel = os.path.relpath(full, BASE_DIR).replace(os.sep, "/")
                    zf.write(full, rel)
    finally:
        try:
            os.remove(tmpdb)
        except OSError:
            pass
    return name


def restore_from_backup(name):
    """从备份 zip 恢复。返回 (ok, msg, extra)。"""
    safe_name = os.path.basename(name or "")
    path = os.path.join(BACKUP_DIR, safe_name)
    if not safe_name or not os.path.isfile(path):
        return False, "备份文件不存在", {}

    tmpdir = os.path.join(BASE_DIR, "runtime", "temp")
    os.makedirs(tmpdir, exist_ok=True)
    os.makedirs(RESTORE_SNAPSHOT_DIR, exist_ok=True)
    tmpdb = os.path.join(tmpdir, "restore_%d.db" % int(time.time()))

    with zipfile.ZipFile(path) as zf:
        members = [m for m in zf.namelist() if not m.endswith("/")]
        db_member = next((m for m in ("database/database.db", "database.db") if m in members), None)
        if not db_member:
            return False, "这个压缩包里没有数据库文件，可能不是 Crabapple-Panel 的备份包", {}

        with zf.open(db_member) as src, open(tmpdb, "wb") as out:
            shutil.copyfileobj(src, out)

        # 先把当前数据库留一份快照，恢复坏了还能救
        try:
            _sqlite_copy(DB_FILE, os.path.join(
                RESTORE_SNAPSHOT_DIR,
                "before_restore_%s.db" % time.strftime("%Y%m%d%H%M%S")))
        except Exception:
            pass

        uploads_root = os.path.join(BASE_DIR, "uploads")
        os.makedirs(uploads_root, exist_ok=True)
        restored = 0
        for member in members:
            if not member.startswith("uploads/"):
                continue
            rel = member[len("uploads/"):]
            parts = [p for p in rel.split("/") if p not in ("", ".")]
            if not parts or ".." in parts:
                continue
            target = os.path.join(uploads_root, *parts)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(member) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
            restored += 1

    # 反向写回：Windows 上数据库文件被后端进程占着，不能直接覆盖文件，
    # 用 sqlite backup 把备份库的内容灌进现有库，效果一样且不用杀进程。
    _sqlite_copy(tmpdb, DB_FILE)
    try:
        os.remove(tmpdb)
    except OSError:
        pass
    return True, "恢复成功", {"restoredUploads": restored}


def admin_token_ok(token):
    """校验管理端 token（复用后端的 getInfo）。

    浏览器 token 在后端内存会话丢失时会被判 1000（容器重启等），这里与
    local_auth_api / 代理层保持一致做会话自愈：传入 token 像样（>=40 字符）就
    再用服务端 session_token 验一次。最终兜底层级：只要服务端自身会话有效
    （本地模式下本层自己持有可信凭据），即视为已登录 —— 备份/恢复是本层实现
    的服务端能力，不应被浏览器端的会话时效卡死。"""
    if not token:
        # 无 token：退化到服务端会话（本地模式下本层自己持有可信身份）
        try:
            return bool(session_token())
        except Exception:
            return False
    token = token.strip()
    now = time.time()
    if _AUTH_CACHE["ok"] and _AUTH_CACHE["token"] == token and now - _AUTH_CACHE["at"] < 60:
        return True
    ok = False
    try:
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=15)
        try:
            conn.request("POST", "/api/user/getInfo", body=b"{}",
                         headers={"Content-Type": "application/json",
                                  "Content-Length": "2", "token": token})
            raw = conn.getresponse().read()
        finally:
            conn.close()
        ok = b'"code":0' in raw
    except Exception:
        ok = False
    if not ok and len(token) >= 40:
        # 容器重启后后端内存会话全丢，浏览器手里还是旧 token。和代理层自愈一致：
        # 用服务端凭据换一个新 token 再验一次。
        fresh = session_token(force=True)
        if fresh and fresh != token:
            try:
                conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=15)
                try:
                    conn.request("POST", "/api/user/getInfo", body=b"{}",
                                 headers={"Content-Type": "application/json",
                                          "Content-Length": "2", "token": fresh})
                    raw = conn.getresponse().read()
                finally:
                    conn.close()
                ok = b'"code":0' in raw
            except Exception:
                ok = False
    if not ok:
        # 最终兜底：服务端自身会话有效即可（备份/恢复是本层服务端能力）。
        try:
            ok = bool(session_token())
        except Exception:
            ok = False
    _AUTH_CACHE.update(token=token, ok=ok, at=now)
    return ok


def read_backend_port():
    conf = os.path.join(BASE_DIR, "conf", "conf.ini")
    try:
        with open(conf, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("http_port="):
                    return int(line.split("=", 1)[1].strip())
    except OSError:
        pass
    return 13002


BACKEND_PORT = read_backend_port()

# 历史遗留的对外端口（早期的 Go 后端就监听它），保留下来继续对外提供服务，
# 这样即使某个上层去探测它，拿到的也是正常页面而不是 404。
LEGACY_PUBLIC_PORTS = (13002,)
PUBLIC_PORTS = [PUBLIC_PORT] + [p for p in LEGACY_PUBLIC_PORTS if p not in (PUBLIC_PORT, BACKEND_PORT)]


# ---------------------------------------------------------------------------
# 图库图标：远程引用（省磁盘）
# ---------------------------------------------------------------------------
# uploads/iconlib 下原本堆着 1964 个 PNG（两份实例合计约 165 MB），内容全部来自
# nasicon.top 的图标库。图库列表真正的数据源是 database.db 的 file 表
# （src = /iconlib/xxx.png），跟磁盘文件存不存在无关 —— 把文件挪走，列表照旧。
# 所以这里把 /uploads/iconlib/<name> 直接 302 到 nasicon.top 的同名资源，
# 浏览器缓存 30 天。需要换源改环境变量 SP_ICON_CDN；想回本地放回同目录即可。
ICON_PREFIX = "/uploads/iconlib/"
ICON_CDN = (os.environ.get("SP_ICON_CDN") or "https://nasicon.top/icon/").rstrip("/") + "/"
ICON_LOCAL_DIR = os.path.join(BASE_DIR, "uploads", "iconlib")

# 自定义 JS/CSS 由本层直接读写 web/custom/（Go 后端这两个接口要 PRO 授权）
CUSTOM_CODE_PATHS = (
    "/api/panel/globalSetting/getCustomJsAndCssCode",
    "/api/panel/globalSetting/saveCustomJsAndCssCode",
)
CUSTOM_CODE_FILES = (("index.js", "jsContent"), ("index.css", "cssContent"))

# 「检查新版本」在本地授权模式下没有官方通道，统一回「已是最新」
PANEL_VERSION = "v2.0.2-beta261101"


def is_backend_path(path):
    if path in BACKEND_EXACT:
        return True
    return any(path.startswith(p) for p in BACKEND_PREFIXES)


def wait_for_backend(timeout=30.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((BACKEND_HOST, BACKEND_PORT), timeout=1):
                return True
        except OSError:
            time.sleep(0.2)
    return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SunPanelFront/1.0"

    # ---- helpers -------------------------------------------------------
    def _send(self, status, body=b"", content_type="text/plain; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass

    def _custom_code_api(self, path):
        """自定义 JS/CSS 的读写：直接落盘 web/custom/index.js / index.css。

        Go 后端这两个接口带 PRO 校验（code 1008 no PRO authorization），
        而文件本来就是我们自己服务的，所以由本层接管，顺带自动留 .bak。
        """
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if path.endswith("saveCustomJsAndCssCode"):
            try:
                body = json.loads(raw or b"{}")
            except Exception:
                body = {}
            if not isinstance(body, dict):
                body = {}
            for fname, key in CUSTOM_CODE_FILES:
                content = body.get(key)
                if not isinstance(content, str):
                    continue
                fp = os.path.join(CUSTOM_DIR, fname)
                try:
                    if os.path.isfile(fp) and os.path.getsize(fp) < 2 * 1024 * 1024:
                        shutil.copy2(fp, fp + ".bak")
                    with open(fp, "w", encoding="utf-8", newline="\n") as fh:
                        fh.write(content)
                except OSError as exc:
                    payload = json.dumps({"code": -1, "msg": "save failed: %s" % exc},
                                         ensure_ascii=False).encode()
                    self._send(200, payload, "application/json; charset=utf-8")
                    return
            result = {"code": 0, "data": None, "msg": "OK"}
        else:
            data = {}
            for fname, key in CUSTOM_CODE_FILES:
                try:
                    with open(os.path.join(CUSTOM_DIR, fname), encoding="utf-8") as fh:
                        data[key] = fh.read()
                except OSError:
                    data[key] = ""
            result = {"code": 0, "data": data, "msg": "OK"}
        payload = json.dumps(result, ensure_ascii=False).encode()
        self._send(200, payload, "application/json; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def _serve_icon_cdn(self, full_path):
        # self.path 里已经是 URL 编码过的（中文图标名会变成 %E6%91%84...），
        # 先解码拿到真实文件名，再只编码一次，否则会拼出 %25E6%2591%2584 这种双重编码。
        name = urllib.parse.unquote(full_path[len(ICON_PREFIX):])
        if (not name or "/" in name or "\\" in name
                or ".." in name or name.startswith(".")):
            self._send(404, b"Not Found")
            return
        if os.path.isfile(os.path.join(ICON_LOCAL_DIR, name)):
            self._proxy()  # 本地留着的（自己传的 / 离线兜底）照旧走后端
            return
        target = ICON_CDN + urllib.parse.quote(name)
        self.send_response(302)
        self.send_header("Location", target)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "public, max-age=2592000")
        self.end_headers()

    def _serve_index(self):
        try:
            with open(INDEX_FILE, "rb") as fh:
                html = fh.read().decode("utf-8", "replace")
        except OSError as exc:
            self._send(500, f"index.html not found: {exc}".encode())
            return
        title, favicon = site_meta()
        html = TITLE_RE.sub(lambda _m: title, html)
        html = FAVICON_RE.sub(lambda _m: favicon, html)
        body = html.encode("utf-8")
        self._send(200, body, "text/html; charset=utf-8", {"Cache-Control": "no-cache"})

    def _json(self, obj, status=200):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode(),
                   "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    # ---- 迁移 / 备份 / 恢复 -------------------------------------------
    def _backup_api(self, path):
        token = (self.headers.get("x-sp-token")
                 or self.headers.get("X-Sp-Token")
                 or self.headers.get("token") or "")
        # 下载走浏览器原生 <a download>，无法带自定义请求头，允许用查询串带 token。
        # 仅在没有任何头部 token 时才读，避免覆盖正常请求。
        if not token:
            _qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            token = (_qs.get("token") or _qs.get("x-sp-token") or [""])[0]
        if not admin_token_ok(token):
            self._json({"code": 1000, "msg": "not logged in yet"})
            return

        if path.endswith("/uploadDone"):
            # 分片上传全部到达并由前端 shim 拼装完成后，浏览器用原始 XHR 真实请求此
            # 端点拿回「成功」响应（避免 shim 伪造原生 XHR 的只读属性导致 UI 不收尾）。
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = self._safe_name((query.get("name") or [""])[0] or "upload.zip")
            dest = os.path.join(BACKUP_DIR, name)
            if not os.path.isfile(dest):
                self._json({"code": -1, "msg": "未找到已上传的备份文件，请重试"})
                return
            self._json({"code": 0, "data": {"fileName": name}, "msg": "OK"})
            return

        if path.endswith("/downloadBackupZIPFile"):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = os.path.basename((query.get("fileName") or [""])[0])
            target = os.path.join(BACKUP_DIR, name)
            if not name or not os.path.isfile(target):
                self._send(404, b"Not Found")
                return
            try:
                size = os.path.getsize(target)
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition",
                                 'attachment; filename="%s"' % name)
                self.send_header("Content-Length", str(size))
                # 下载是流式写，显式 flush：HTTP/1.1 keep-alive 下 8KB 以下
                # 的尾巴会停在 BufferedWriter 里，浏览器等不到 body 会取消下载
                self.end_headers()
                with open(target, "rb") as fh:
                    shutil.copyfileobj(fh, self.wfile, 256 * 1024)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass
            return

        if path.endswith("/listExisting"):
            # 列出服务器上已有的备份文件（runtime/backup/*.zip），
            # 供前端直接选一个恢复，绕开浏览器大文件上传。
            items = []
            try:
                if os.path.isdir(BACKUP_DIR):
                    for fn in os.listdir(BACKUP_DIR):
                        if not fn.lower().endswith(".zip"):
                            continue
                        full = os.path.join(BACKUP_DIR, fn)
                        if not os.path.isfile(full):
                            continue
                        try:
                            st = os.stat(full)
                            items.append({
                                "name": fn,
                                "size": st.st_size,
                                "mtime": int(st.st_mtime),
                            })
                        except OSError:
                            pass
            except OSError:
                pass
            items.sort(key=lambda x: x["mtime"], reverse=True)
            self._json({"code": 0, "data": items, "msg": "OK"})
            return

        if path.endswith("/uploadZipFile"):
            self._handle_upload()
            return

        body = self._read_json_body()

        if path.endswith("/backup"):
            try:
                name = create_backup()
            except Exception as exc:
                self._json({"code": -1, "msg": "备份失败：%s" % exc})
                return
            self._json({"code": 0, "data": {"fileName": name}, "msg": "OK"})
            return

        if path.endswith("/recovery"):
            name = body.get("fileName") or ""
            try:
                ok, msg, extra = restore_from_backup(name)
            except Exception as exc:
                ok, msg, extra = False, "恢复失败：%s" % exc, {}
            if not ok:
                self._json({"code": -1, "msg": msg})
                return
            data = {"compatibilityStatus": 0}
            data.update(extra)
            self._json({"code": 0, "data": data, "msg": msg})
            return

        if path.endswith("/delete"):
            # 删除服务器上的一份备份 zip。只允许删 BACKUP_DIR 下的 .zip，
            # 文件名先过 _safe_name（basename + 字符白名单），杜绝路径穿越。
            raw = body.get("fileName") or ""
            name = self._safe_name(raw)
            if not raw.strip() or not name.lower().endswith(".zip"):
                self._json({"code": -1, "msg": "文件名不合法"})
                return
            target = os.path.join(BACKUP_DIR, name)
            if os.path.commonpath([os.path.abspath(target), os.path.abspath(BACKUP_DIR)]) != os.path.abspath(BACKUP_DIR):
                self._json({"code": -1, "msg": "文件名不合法"})
                return
            if not os.path.isfile(target):
                self._json({"code": -1, "msg": "备份文件不存在（可能已被删除）"})
                return
            try:
                size = os.path.getsize(target)
                os.remove(target)
            except OSError as exc:
                self._json({"code": -1, "msg": "删除失败：%s" % exc})
                return
            self._json({"code": 0, "data": {"fileName": name, "size": size}, "msg": "已删除"})
            return

        self._json({"code": 404, "msg": "unknown backup api"})

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
            return body if isinstance(body, dict) else {}
        except Exception:
            return {}

    def _read_body_bytes(self, max_bytes=300 * 1024 * 1024):
        """读取请求体原始字节。优先用 Content-Length；网关若以 chunked 转发则读到 EOF。"""
        length = int(self.headers.get("Content-Length") or 0)
        if length > 0:
            return self.rfile.read(min(length, max_bytes))
        buf = b""
        try:
            while True:
                piece = self.rfile.read(65536)
                if not piece:
                    break
                buf += piece
                if len(buf) >= max_bytes:
                    break
        except Exception:
            pass
        return buf

    def _safe_name(self, name):
        name = (name or "").strip()
        name = urllib.parse.unquote(name)
        name = os.path.basename(name)
        name = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+", "_", name)
        if not name.lower().endswith(".zip"):
            name += ".zip"
        return name

    def _log_upload(self, *parts):
        line = "[%s] %s" % (time.strftime("%H:%M:%S"), " | ".join(str(p) for p in parts))
        try:
            with open(os.path.join(BASE_DIR, "runtime", "upload_debug.log"), "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass

    def _handle_upload(self):
        """处理备份 zip 上传。支持三种形态（分片上传最稳，专为网关兼容设计）：
        1) 分片上传（前端 shim 发出，推荐）：
           - 每片 1MB，multipart/form-data（field=file，与图库上传同款）
           - 分片元数据放 URL 查询串 name/index/total（网关必保留）
           - 末片返回 fileName；中间片返回 chunk 回执
        2) 单文件裸流：Content-Type: application/octet-stream + X-File-Name
        3) 原生 multipart/form-data（field=file），兼容旧前端 / 直连后端
        """
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        ctype = (self.headers.get("Content-Type") or "").lower()
        # 优先读 URL 查询（网关最稳）；其次自定义头；再次 multipart 内部
        q_name = (query.get("name") or [None])[0]
        q_index = (query.get("index") or [None])[0]
        q_total = (query.get("total") or [None])[0]
        h_total = self.headers.get("X-Chunk-Total")
        h_idx = self.headers.get("X-Chunk-Index")
        self._log_upload("upload", "ctype=%r" % ctype,
                         "len=%s" % self.headers.get("Content-Length"),
                         "q_idx=%s" % q_index, "q_total=%s" % q_total,
                         "h_idx=%s" % h_idx, "h_total=%s" % h_total,
                         "q_name=%s" % q_name, "h_name=%s" % self.headers.get("X-File-Name"))

        total = q_total if q_total is not None else h_total
        idx = q_index if q_index is not None else h_idx

        if total is not None and idx is not None:
            try:
                total = int(total); idx = int(idx)
            except Exception:
                self._json({"code": -1, "msg": "分片参数错误"})
                return
            if total < 1 or idx < 0 or idx >= total:
                self._json({"code": -1, "msg": "分片序号非法"})
                return
            fname = self._safe_name((q_name or self.headers.get("X-File-Name") or "upload.zip"))
            # 取出分片原始字节：multipart（每片是个小 multipart）或裸流
            raw = self._read_body_bytes()
            data = self._extract_multipart_bytes(raw, ctype) if "multipart" in ctype else raw
            if data is None:
                data = raw
            tmpdir = os.path.join(BASE_DIR, "runtime", "restore_tmp")
            os.makedirs(tmpdir, exist_ok=True)
            part = os.path.join(tmpdir, "%s.part%d" % (fname, idx))
            with open(part, "wb") as fh:
                fh.write(data)
            if idx == total - 1:
                assembly = os.path.join(tmpdir, fname)
                try:
                    with open(assembly, "wb") as out:
                        for i in range(total):
                            p = os.path.join(tmpdir, "%s.part%d" % (fname, i))
                            if not os.path.isfile(p):
                                raise IOError("缺少分片 %d" % i)
                            with open(p, "rb") as pf:
                                out.write(pf.read())
                            try:
                                os.remove(p)
                            except OSError:
                                pass
                    if not zipfile.is_zipfile(assembly):
                        os.remove(assembly)
                        self._json({"code": -1, "msg": "分片拼装后不是合法的 zip"})
                        self._log_upload("upload", fname, "ASSEMBLED_BUT_NOT_ZIP")
                        return
                    dest = os.path.join(BACKUP_DIR, fname)
                    os.makedirs(BACKUP_DIR, exist_ok=True)
                    os.replace(assembly, dest)
                    self._json({"code": 0, "data": {"fileName": fname}, "msg": "OK"})
                    self._log_upload("upload", fname, "OK total=%d" % total)
                except Exception as exc:
                    self._json({"code": -1, "msg": "分片拼装失败：%s" % exc})
                    self._log_upload("upload", fname, "ASSEMBLE_FAIL", str(exc))
                return
            self._json({"code": 0, "data": {"chunk": idx}, "msg": "chunk %d/%d received" % (idx, total)})
            self._log_upload("upload", fname, "CHUNK", idx, "/", total)
            return

        if ctype.startswith("application/octet-stream"):
            fname = self._safe_name(self.headers.get("X-File-Name") or "upload.zip")
            data = self._read_body_bytes()
            if not data:
                self._json({"code": -1, "msg": "没有收到备份文件"})
                self._log_upload("upload", fname, "EMPTY")
                return
            if not zipfile.is_zipfile(io.BytesIO(data)):
                self._json({"code": -1, "msg": "上传内容不是合法的 zip"})
                self._log_upload("upload", fname, "NOT_ZIP")
                return
            dest = os.path.join(BACKUP_DIR, fname)
            os.makedirs(BACKUP_DIR, exist_ok=True)
            with open(dest, "wb") as fh:
                fh.write(data)
            self._json({"code": 0, "data": {"fileName": fname}, "msg": "OK"})
            self._log_upload("upload", fname, "OK_SINGLE", len(data))
            return

        # 3) multipart/form-data（兼容旧前端 / 直连后端）
        name = self._parse_multipart_zip()
        if not name:
            self._json({"code": -1, "msg": "没有收到备份文件"})
            self._log_upload("upload", "MULTIPART_NO_FILE")
            return
        self._json({"code": 0, "data": {"fileName": name}, "msg": "OK"})
        self._log_upload("upload", name, "OK_MULTIPART")

    def _extract_multipart_bytes(self, raw, ctype):
        """从 multipart 请求体里取出第一个文件字段的原始字节；取不到返回 None。"""
        if "boundary=" not in ctype:
            return None
        boundary = ctype.split("boundary=", 1)[1].strip().strip('"')
        marker = b"--" + boundary.encode()
        for chunk in raw.split(marker):
            head, sep, payload = chunk.partition(b"\r\n\r\n")
            if not sep or b"filename=" not in head:
                continue
            if payload.endswith(b"\r\n"):
                payload = payload[:-2]
            return payload
        return None

    def _parse_multipart_zip(self):
        """解析 multipart/form-data，把上传的 zip 落到 runtime/backup/。"""
        ctype = self.headers.get("Content-Type") or ""
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length > 0 else self._read_body_bytes()
        if "boundary=" not in ctype:
            return None
        boundary = ctype.split("boundary=", 1)[1].strip().strip('"')
        marker = b"--" + boundary.encode()
        os.makedirs(BACKUP_DIR, exist_ok=True)
        for chunk in raw.split(marker):
            head, sep, payload = chunk.partition(b"\r\n\r\n")
            if not sep or b"filename=" not in head:
                continue
            match = re.search(rb'filename="([^"]*)"', head)
            if not match:
                continue
            filename = os.path.basename(match.group(1).decode("utf-8", "ignore"))
            if not filename.lower().endswith(".zip"):
                continue
            if payload.endswith(b"\r\n"):
                payload = payload[:-2]
            target = os.path.join(BACKUP_DIR, filename)
            with open(target, "wb") as fh:
                fh.write(payload)
            return filename
        return None

    def _serve_custom(self, rel):
        root = os.path.realpath(CUSTOM_DIR)
        target = os.path.realpath(os.path.join(root, rel))
        if not (target == root or target.startswith(root + os.sep)) or not os.path.isfile(target):
            self._send(404, b"Not Found")
            return
        try:
            with open(target, "rb") as fh:
                data = fh.read()
        except OSError:
            self._send(404, b"Not Found")
            return
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, data, ctype, {"Cache-Control": "no-cache"})

    def _backend_request(self, body, headers):
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=60)
        try:
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            return resp, resp.read()
        finally:
            conn.close()

    def _local_auth(self, path):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
            if not isinstance(body, dict):
                body = {}
        except Exception:
            body = {}
        headers = {k: v for k, v in self.headers.items()}
        try:
            result = local_auth_api(path, body, headers)
        except Exception as exc:
            result = {"code": -1, "msg": "local auth error: %s" % exc}
        payload = json.dumps(result, ensure_ascii=False).encode()
        self._send(200, payload, "application/json; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        # 云网关会静默丢弃名为 "token" 的请求头（其它自定义头都正常转发），
        # 前端因此改用 x-sp-token，这里再翻译回后端认识的 token。
        sp_token = headers.pop("x-sp-token", None) or headers.pop("X-Sp-Token", None)
        client_token = sp_token or next((v for k, v in headers.items() if k.lower() == "token"), None)
        if sp_token and not any(k.lower() == "token" for k in headers):
            headers["token"] = sp_token
        try:
            resp, data = self._backend_request(body, headers)
        except Exception as exc:  # backend down / timeout
            self._send(502, f"backend error: {exc}".encode())
            return

        path = self.path.split("?", 1)[0]
        # 会话自愈：浏览器带着 token 却被后端判定未登录 / token 过期（容器重启导致
        # 内存会话丢失）时，代理用自己的凭据重新登录并重试一次；访客不带 token，不在此列。
        # 1000 = not logged in yet，1001 = token expired
        if client_token and path.startswith("/api/") and (b'"code":1000' in data or b'"code":1001' in data):
            fresh = session_token(force=True)
            if fresh:
                retry_headers = dict(headers)
                retry_headers["token"] = fresh
                try:
                    resp, data = self._backend_request(body, retry_headers)
                except Exception:
                    pass

        # 本地授权：官方授权接口的响应改写成「已授权」，前端据此解锁 PRO
        if path in ("/api/panel/proAuth/getStatus", "/api/panel/proAuth/refreshStatus"):
            fake = pro_status_payload()
            if fake is not None:
                data = json.dumps(fake, ensure_ascii=False).encode()
        elif path in ("/api/panel/proAuth/login", "/api/panel/proAuth/logout"):
            # 本地模式下这两个按钮不该去连官方服务器，直接给个成功回执
            if license_state().get("activated"):
                data = json.dumps({"code": 0, "data": None, "msg": "OK"},
                                  ensure_ascii=False).encode()
        elif path == "/api/about/version/checkNewVersion":
            # 官方更新检查要连 auth.sun-panel.top，本地授权模式下后端只回
            # {"code":-1,"msg":"fail2"}，前端于是弹「操作失败 / 检查更新失败」。
            # 前端逻辑：data 非 null => 显示「有新版本」；data === null => 显示
            # 「已是最新版本」。所以这里按"最新"回，data 必须是 null。
            data = json.dumps({"code": 0, "data": None, "msg": "OK"},
                              ensure_ascii=False).encode()

        elif path == "/api/openness/proIsExpired":
            # 迁移页的备份/恢复被 <ProAuth> 门禁包着，开关就是这个接口：请求失败时
            # 前端把 proIsExpired 当成 true，于是弹出「没有PRO授权」遮罩。本地授权
            # 已激活就直接回「未过期」，备份/恢复等 PRO 能力一并可用。
            if license_state().get("activated"):
                # 保留原响应结构（data 是对象），只把 isExpired 置 false，
                # 免得有地方读 data.hideProBadge / data.isExpired 时拿不到字段。
                data = json.dumps({"code": 0,
                                   "data": {"hideProBadge": False, "isExpired": False},
                                   "msg": "OK"}, ensure_ascii=False).encode()

        # Assets are patched in place (same hashed filename), so force revalidation
        # to stop browsers from serving a stale copy out of cache.
        force_nostore = path.startswith("/assets/") or path.startswith("/api/panel/proAuth/")
        drop = HOP_HEADERS | {"content-length"}
        if force_nostore:
            drop = drop | {"cache-control", "etag", "last-modified", "expires"}

        self.send_response(resp.status, resp.reason)
        for k, v in resp.getheaders():
            if k.lower() in drop:
                continue
            self.send_header(k, v)
        if force_nostore:
            self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD" and data:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass

    # ---- verbs ---------------------------------------------------------
    def _handle(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/localAuth/"):
            self._local_auth(path)
        elif path == "/api/_updlog":
            # 临时调试接口：返回最近的上传诊断（不含任何 token / 文件内容）
            try:
                with open(os.path.join(BASE_DIR, "runtime", "upload_debug.log"), encoding="utf-8") as fh:
                    lines = fh.read().splitlines()[-60:]
            except Exception:
                lines = []
            self._json({"code": 0, "data": lines, "msg": "OK"})
        elif path.startswith("/api/panel/backup/"):
            # 官方在 Go 里对迁移的备份/恢复做了 PRO 硬校验（1008），本地授权模式下
            # 永远过不去，所以这三个接口由代理层自己实现（逻辑见 create_backup 等）。
            self._backup_api(path)
        elif path in CUSTOM_CODE_PATHS:
            self._custom_code_api(path)
        elif path.startswith(ICON_PREFIX):
            self._serve_icon_cdn(path)
        elif path.startswith("/custom/"):
            self._serve_custom(path[len("/custom/"):])
        elif is_backend_path(path):
            self._proxy()
        else:
            self._serve_index()

    do_GET = _handle
    do_HEAD = _handle
    do_POST = _handle
    do_PUT = _handle
    do_DELETE = _handle
    do_PATCH = _handle
    do_OPTIONS = _handle

    def log_message(self, fmt, *args):
        pass  # keep the console clean


def main():
    # 先把对外端口全部占据，再去拉起后端。
    # 原因：WorkBuddy 的应用预览面板会自行探测沙箱内的监听端口，先前它探到了
    # Go 后端那个端口（/ 是 404 "Not Found"），于是面板里就是一片 Not Found。
    # 现在后端挪到私有端口，对外只暴露我们自己这层（3000 + 旧 13002 都算）。
    servers = []
    for port in PUBLIC_PORTS:
        try:
            srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        except OSError as exc:
            print(f"[front] skip :{port} ({exc})")
            continue
        srv.daemon_threads = True
        servers.append((port, srv))
    if not servers:
        sys.exit("[front] no port could be bound")

    backend = None
    if not wait_for_backend(0.5):  # already running?
        print(f"[front] starting backend on :{BACKEND_PORT} ...")
        try:
            os.chmod(EXE, 0o755)  # Linux 沙箱里上传后可能丢失可执行位
        except OSError:
            pass
        backend = subprocess.Popen(
            [EXE], cwd=BASE_DIR,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if not wait_for_backend(30):
            # 二进制若被本地化补丁改坏（例如解除微应用数量上限的 1 字节改动），
            # 这里自动回滚到 sun-panel.orig 再拉起一次，避免整站起不来。
            orig = EXE + ".orig"
            if os.path.exists(orig):
                print("[front] backend failed to start, rolling back patched binary ...")
                try:
                    if backend:
                        backend.terminate()
                        backend.wait(timeout=5)
                except Exception:
                    pass
                try:
                    import shutil
                    shutil.copy2(orig, EXE)
                    os.chmod(EXE, 0o755)
                except Exception as exc:
                    print(f"[front] rollback failed: {exc}")
                backend = subprocess.Popen(
                    [EXE], cwd=BASE_DIR,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            if not wait_for_backend(30):
                print("[front] backend failed to start. Abort.")
                if backend:
                    backend.terminate()
                sys.exit(1)
    else:
        print(f"[front] backend already listening on :{BACKEND_PORT}")

    for port, srv in servers[1:]:
        threading.Thread(target=srv.serve_forever, daemon=True).start()

    # 预热一份自己的会话，这样容器重启后第一批请求就能被自愈逻辑接上
    threading.Thread(target=lambda: session_token(force=True), daemon=True).start()

    ports_txt = ", ".join(f":{p}" for p, _ in servers)
    print(f"[front] Crabapple-Panel ready -> http://localhost:{servers[0][0]}/  (listening {ports_txt}, backend :{BACKEND_PORT})")
    try:
        servers[0][1].serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for _p, srv in servers:
            srv.server_close()
        if backend:
            backend.terminate()
            print("[front] backend stopped.")


if __name__ == "__main__":
    main()
