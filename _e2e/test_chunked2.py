import http.client, json, os, zipfile, urllib.parse, time

BASE = "127.0.0.1"
PORT = 3099
ROOT = os.path.dirname(os.path.abspath(__file__))
WIN = os.path.join(ROOT, "..", "sun-panel_v2.0.2-beta261101_windows_amd64")
WIN = os.path.abspath(WIN)
BACKUP = os.path.join(WIN, "runtime", "backup")
TOKEN = None

def req(method, path, body=b"", headers=None, ctype=None):
    global TOKEN
    h = dict(headers or {})
    if body and ctype:
        h["Content-Type"] = ctype
        h["Content-Length"] = str(len(body))
    if TOKEN:
        h.setdefault("x-sp-token", TOKEN)
    c = http.client.HTTPConnection(BASE, PORT, timeout=30)
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    data = r.read().decode("utf-8", "replace")
    c.close()
    return r.status, data

# 1) login
with open(os.path.join(WIN, "runtime", "auto_login.json"), encoding="utf-8") as f:
    creds = json.load(f)
st, body = req("POST", "/api/login",
               json.dumps({"username": creds["username"], "password": creds["password"]}).encode(),
               ctype="application/json")
print("login:", st, body[:120])
try:
    TOKEN = json.loads(body).get("data", {}).get("token") or json.loads(body).get("token")
except Exception:
    pass
print("token?", bool(TOKEN))

# 2) make a >1MB valid zip
os.makedirs(BACKUP, exist_ok=True)
zpath = os.path.join(BACKUP, "_chunktest.zip")
with zipfile.ZipFile(zpath, "w") as z:
    z.writestr("Sun-Panel_backup_v2_2.0.2-beta261101.txt", "{}")
    z.writestr("database/database.db", os.urandom(2_600_000))  # ~2.5MB
raw = open(zpath, "rb").read()
print("zip size:", len(raw), "valid zip:", zipfile.is_zipfile(zpath))

# 3) chunked multipart upload (each 1MB), metadata in URL query
CHUNK = 1 * 1024 * 1024
total = max(1, (len(raw) + CHUNK - 1) // CHUNK)
name = "_chunktest.zip"
print("chunks:", total)
boundary = "----spchunktest123"
for i in range(total):
    piece = raw[i*CHUNK:(i+1)*CHUNK]
    head = ("--%s\r\n" % boundary +
            'Content-Disposition: form-data; name="file"; filename="%s"\r\n' % name +
            "Content-Type: application/octet-stream\r\n\r\n")
    tail = "\r\n--%s--\r\n" % boundary
    body = head.encode() + piece + tail.encode()
    q = "/api/panel/backup/uploadZipFile?name=%s&index=%d&total=%d" % (
        urllib.parse.quote(name), i, total)
    st, resp = req("POST", q, body, ctype="multipart/form-data; boundary=%s" % boundary)
    print("chunk", i, "->", st, resp[:140])

# 4) verify assembled file
dest = os.path.join(BACKUP, name)
print("assembled exists:", os.path.isfile(dest), "size:", os.path.getsize(dest) if os.path.isfile(dest) else 0,
      "valid:", zipfile.is_zipfile(dest) if os.path.isfile(dest) else False)

# 5) diagnostic log
st, log = req("GET", "/api/_updlog")
print("=== _updlog (last lines) ===")
try:
    lines = json.loads(log).get("data", [])
    for ln in lines[-12:]:
        print(ln)
except Exception:
    print(log[:400])

# cleanup
for p in (dest, zpath):
    try: os.remove(p)
    except OSError: pass
tmp = os.path.join(WIN, "runtime", "restore_tmp")
if os.path.isdir(tmp):
    for f in os.listdir(tmp):
        try: os.remove(os.path.join(tmp, f))
        except OSError: pass
