import http.client, os, zipfile, json, urllib.parse

BASE = "127.0.0.1"
PORT = 3099
CHUNK = 1.5 * 1024 * 1024

# 用本地凭据登录拿真实 token（仅本机测试用）
cfg = json.load(open("runtime/auto_login.json", encoding="utf-8"))
cred = (cfg.get("username"), cfg.get("password"))

def req(method, path, body=None, headers=None):
    h = headers or {}
    c = http.client.HTTPConnection(BASE, PORT, timeout=30)
    kwargs = {}
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            kwargs["body"] = body
        else:
            kwargs["body"] = body.encode()
    c.request(method, path, headers=h, **kwargs)
    r = c.getresponse()
    txt = r.read().decode()
    c.close()
    return r.status, txt

# 登录
st, txt = req("POST", "/api/login",
              json.dumps({"username": cred[0], "password": cred[1]}),
              {"Content-Type": "application/json", "Content-Length": str(len(json.dumps({"username": cred[0], "password": cred[1]})))})
print("login ->", st, txt[:160])
try:
    TOKEN = json.loads(txt).get("data", {}).get("token")
except Exception:
    TOKEN = None
print("token obtained:", bool(TOKEN), "len", len(TOKEN or ""))

# 造一个 4MB 的测试 zip
os.makedirs("runtime/backup", exist_ok=True)
big = os.urandom(4 * 1024 * 1024)
zpath = "runtime/_test_big.zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("Sun-Panel_backup_v2_2.0.2-beta261101.txt", "{}")
    z.writestr("database/database.db", big)
data = open(zpath, "rb").read()
print("test zip size:", len(data), "bytes")

parts = [data[i:i+int(CHUNK)] for i in range(0, len(data), int(CHUNK))]
total = len(parts)
print("chunks:", total)
fname = "我的备份_test.zip"
for idx, piece in enumerate(parts):
    h = {
        "Content-Type": "application/octet-stream",
        "x-sp-token": TOKEN,
        "X-File-Name": urllib.parse.quote(fname),
        "X-Chunk-Total": str(total),
        "X-Chunk-Index": str(idx),
        "Content-Length": str(len(piece)),
    }
    st, txt = req("POST", "/api/panel/backup/uploadZipFile", piece, h)
    print("chunk", idx, "->", st, txt[:140])

dest = os.path.join("runtime/backup", fname)
ok = os.path.isfile(dest) and zipfile.is_zipfile(dest)
print("assembled on disk:", ok, "size", os.path.getsize(dest) if ok else 0)
if ok:
    with zipfile.ZipFile(dest) as z:
        got = z.read("database/database.db")
    print("content matches:", got == big)

# 单文件裸流
single = "runtime/_single.zip"
with zipfile.ZipFile(single, "w") as z:
    z.writestr("database/database.db", b"hello-single")
sdata = open(single, "rb").read()
st, txt = req("POST", "/api/panel/backup/uploadZipFile", sdata, {
    "Content-Type": "application/octet-stream", "x-sp-token": TOKEN,
    "X-File-Name": "single_test.zip", "Content-Length": str(len(sdata))})
print("single raw ->", st, txt[:140])

# multipart 兼容
boundary = "----spboundaryxyz"
mp = (("--%s\r\n" % boundary +
       'Content-Disposition: form-data; name="file"; filename="mp_test.zip"\r\n'
       "Content-Type: application/zip\r\n\r\n").encode() +
      sdata + ("\r\n--%s--\r\n" % boundary).encode())
st, txt = req("POST", "/api/panel/backup/uploadZipFile", mp, {
    "Content-Type": "multipart/form-data; boundary=%s" % boundary,
    "x-sp-token": TOKEN, "Content-Length": str(len(mp))})
print("multipart ->", st, txt[:140])

# 再测恢复（recovery）是否能跑通
st, txt = req("POST", "/api/panel/backup/recovery",
              json.dumps({"fileName": fname}),
              {"Content-Type": "application/json", "Content-Length": str(len(json.dumps({"fileName": fname}))), "token": TOKEN})
print("recovery ->", st, txt[:200])

print("--- upload_debug.log tail ---")
try:
    print(open("runtime/upload_debug.log", encoding="utf-8").read()[-1400:])
except Exception as e:
    print("no log:", e)

for f in (zpath, single):
    try: os.remove(f)
    except OSError: pass
