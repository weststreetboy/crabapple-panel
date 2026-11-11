#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把本地 Windows 实例的「图库资源 + 数据库快照」同步到 dist-linux 公网版。

只做这几件事，全部幂等：
  1. uploads/2026/*     -> dist-linux/uploads/2026/      (用户上传的壁纸等)
  2. database.db 在线快照(sqLite backup API) -> dist-linux/database/database.db
  3. 补建 micro_app / runtime 空目录
  4. 清理 dist-linux/uploads/iconlib —— 图标改为 302 到 nasicon.top（见 server.py），
     本地不再留副本，省 ~80 MB
"""
import os
import shutil
import sqlite3
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "sun-panel_v2.0.2-beta261101_windows_amd64")
DST = os.path.join(BASE, "dist-linux")

# 图标库不再随包同步：/uploads/iconlib/<name> 由 server.py 302 到 nasicon.top，
# database.db 里的 file 记录照旧，图库列表不受影响。
CDN_UPLOAD_DIRS = ("iconlib",)


def copy_tree(src, dst):
    copied = skipped = 0
    for root, _dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        target_dir = os.path.normpath(os.path.join(dst, rel))
        os.makedirs(target_dir, exist_ok=True)
        for name in files:
            s = os.path.join(root, name)
            d = os.path.join(target_dir, name)
            if os.path.exists(d) and os.path.getsize(d) == os.path.getsize(s):
                skipped += 1
                continue
            shutil.copy2(s, d)
            copied += 1
    return copied, skipped


def snapshot_db():
    src = os.path.join(SRC, "database", "database.db")
    dst_dir = os.path.join(DST, "database")
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, "database.db")
    saved = read_live_state(dst)
    tmp = dst + ".new"
    if os.path.exists(tmp):
        os.remove(tmp)
    s = sqlite3.connect(src)
    d = sqlite3.connect(tmp)
    with d:
        s.backup(d)
    d.close()
    s.close()
    os.replace(tmp, dst)
    c = sqlite3.connect(dst)
    with c:
        restore_live_state(c, saved)
    rows = c.execute("select count(*) from file").fetchone()[0]
    icons = c.execute("select count(*) from file where type=2").fetchone()[0]
    c.close()
    return rows, icons


def read_live_state(db_path):
    """公网上被人改过的"活配置"，同步时要留住，不能被本地的旧值盖回去。

    目前只管两样：管理员密码、站点设置（标题/图标/登录背景）。
    """
    if not os.path.exists(db_path):
        return {}
    try:
        c = sqlite3.connect(db_path)
        pwd = c.execute("select password from user where id=1").fetchone()
        site = c.execute(
            "select config_value from system_setting where config_name='global_setting_site'"
        ).fetchone()
        c.close()
        return {"password": pwd[0] if pwd else None,
                "global_setting_site": site[0] if site else None}
    except Exception as exc:
        print(f"[warn] read live state failed: {exc}")
        return {}


def restore_live_state(conn, saved):
    if not saved:
        return
    if saved.get("password"):
        conn.execute("update user set password=? where id=1", (saved["password"],))
        print("[preserve] user.password (公网改过的密码)")
    if saved.get("global_setting_site"):
        n = conn.execute(
            "update system_setting set config_value=? where config_name='global_setting_site'",
            (saved["global_setting_site"],),
        ).rowcount
        if n:
            print("[preserve] system_setting.global_setting_site (标题/图标/登录背景)")


def main():
    if not os.path.isdir(SRC):
        sys.exit("source not found: " + SRC)

    for name in ("2026",):
        s = os.path.join(SRC, "uploads", name)
        d = os.path.join(DST, "uploads", name)
        if not os.path.isdir(s):
            print(f"[skip] {name}: not present")
            continue
        os.makedirs(d, exist_ok=True)
        c, k = copy_tree(s, d)
        print(f"[uploads/{name}] copied={c} skipped={k}")

    for name in CDN_UPLOAD_DIRS:
        d = os.path.join(DST, "uploads", name)
        if os.path.isdir(d):
            n = sum(len(f) for _r, _d, f in os.walk(d))
            shutil.rmtree(d, ignore_errors=True)
            print(f"[cdn] 清理 uploads/{name}: {n} 个文件（改走远程引用）")

    for sub in ("micro_app/install_package", "micro_app/run", "runtime/temp", "runtime/runlog"):
        os.makedirs(os.path.join(DST, sub), exist_ok=True)

    # 已安装微应用的运行目录必须跟着数据库一起同步，否则公网上数据库里有记录、
    # 磁盘上没有 main.js，首页那几个应用会 404。
    s = os.path.join(SRC, "micro_app", "run")
    d = os.path.join(DST, "micro_app", "run")
    if os.path.isdir(s):
        c, k = copy_tree(s, d)
        print(f"[micro_app/run] copied={c} skipped={k}")

    # 自定义注入脚本（视频背景增强 / 授权中心）
    s = os.path.join(SRC, "web", "custom")
    d = os.path.join(DST, "web", "custom")
    if os.path.isdir(s):
        c, k = copy_tree(s, d)
        print(f"[web/custom] copied={c} skipped={k}")

    rows, icons = snapshot_db()
    files = sum(len(f) for _r, _d, f in os.walk(os.path.join(DST, "uploads")))
    print(f"[db] file rows={rows} (icons={icons})")
    print(f"[dist] uploads files={files} (iconlib 走远程，不占盘)")
    print("[done]")


if __name__ == "__main__":
    main()
