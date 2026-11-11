// 在 Node 受控环境加载真实的 upload-shim.js，验证其完整控制流能触发 onload。
const http = require('http');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ---- 仿 server.py 的分片拼装逻辑 ----
const BACKUP = path.join(__dirname, 'shim_tmp_backup');
const TMP = path.join(__dirname, 'shim_tmp_parts');
fs.mkdirSync(BACKUP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const server = http.createServer((req, res) => {
  const url = req.url;
  if (url.startsWith('/api/panel/backup/uploadDone')) {
    const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
    const name = q.name || 'upload.zip';
    const dest = path.join(BACKUP, name);
    if (!fs.existsSync(dest)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: -1, msg: 'no file' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, data: { fileName: name }, msg: 'OK' }));
    return;
  }
  if (url.startsWith('/api/panel/backup/uploadZipFile')) {
    const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
    let body = [];
    req.on('data', c => body.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(body);
      // 解析 multipart 取出第一个文件字段的内容
      const ct = req.headers['content-type'] || '';
      let data = raw;
      const m = ct.match(/boundary=(.+)$/);
      if (m) {
        const b = '--' + m[1].trim();
        const rawStr = raw.toString('latin1');
        const parts = rawStr.split(b);
        for (const p of parts) {
          if (p.includes('filename=') && p.includes('\r\n\r\n')) {
            let payload = p.split('\r\n\r\n')[1];
            if (payload.endsWith('\r\n')) payload = payload.slice(0, -2);
            data = Buffer.from(payload, 'latin1');
            break;
          }
        }
      }
      const total = parseInt(q.total, 10), idx = parseInt(q.index, 10);
      const fname = q.name || 'upload.zip';
      fs.writeFileSync(path.join(TMP, fname + '.part' + idx), data);
      if (idx === total - 1) {
        const out = path.join(BACKUP, fname);
        const fd = fs.openSync(out, 'w');
        for (let i = 0; i < total; i++) {
          const pb = fs.readFileSync(path.join(TMP, fname + '.part' + i));
          fs.writeSync(fd, pb);
        }
        fs.closeSync(fd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: { fileName: fname }, msg: 'OK' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: { chunk: idx }, msg: 'chunk ' + idx }));
      }
    });
    return;
  }
  res.writeHead(404); res.end('nf');
});

// ---- 浏览器全局 mock ----
class MockBlob {
  constructor(parts, opts) {
    this.type = (opts && opts.type) || '';
    const flat = [];
    const walk = (p) => {
      if (p == null) return;
      if (p instanceof MockBlob) { p._bufs.forEach(b => flat.push(b)); }
      else if (Buffer.isBuffer(p)) flat.push(p);
      else if (typeof p === 'string') flat.push(Buffer.from(p, 'latin1'));
      else flat.push(Buffer.from(p));
    };
    (Array.isArray(parts) ? parts : [parts]).forEach(walk);
    this._bufs = flat;
    this._buf = Buffer.concat(flat);
    this.size = this._buf.length;
  }
}
class MockFile extends MockBlob {
  constructor(parts, name, opts) { super(parts, opts); this.name = name; }
}
class MockFormData {
  constructor() { this._m = {}; }
  append(k, v) { this._m[k] = v; }
  get(k) { return this._m[k]; }
}
let bannerEl = null;
const documentMock = {
  getElementById(id) { return bannerEl; },
  createElement() { return { style: {}, set innerHTML(v) {}, set onclick(f) {}, appendChild() {} }; },
  body: { appendChild() {} },
};

class MockXHR {
  constructor() {
    this.status = 0; this.statusText = ''; this.responseText = ''; this.response = null;
    this.readyState = 0; this.responseURL = '';
    this.timeout = 0; this.onreadystatechange = null; this.onload = null; this.onerror = null;
    this.ontimeout = null; this.onloadend = null;
    this._headers = {};
  }
  open(m, u, async) { this._m = m; this._u = u; }
  setRequestHeader(k, v) { this._headers[k] = v; }
  send(body) {
    const self = this;
    const u = new URL(this._u, 'http://127.0.0.1:' + PORT);
      const outBuf = bodyBytes(body);
      const r = http.request({ hostname: '127.0.0.1', port: PORT, path: u.pathname + u.search, method: this._m,
      headers: Object.assign({ 'Content-Type': this._headers['Content-Type'] || 'application/octet-stream', 'Content-Length': outBuf.length }, this._headers) },
      (resp) => {
        let d = []; resp.on('data', c => d.push(c)); resp.on('end', () => {
          self.status = resp.statusCode;
          self.responseText = Buffer.concat(d).toString('utf-8');
          self.readyState = 4;
          if (self.onreadystatechange) self.onreadystatechange({ target: self, currentTarget: self });
          if (self.onload) self.onload({ target: self, currentTarget: self });
          if (self.onloadend) self.onloadend({ target: self, currentTarget: self });
        });
      });
    r.on('error', () => { if (self.onerror) self.onerror({ target: self }); });
    if (Buffer.isBuffer(body)) r.write(body); else if (body && body._buf) r.write(body._buf); else if (typeof body === 'string') r.write(Buffer.from(body)); else r.write(outBuf);
    r.end();
  }
}

    const PORT = 3999;
    function bodyBytes(b) {
      if (Buffer.isBuffer(b)) return b;
      if (b && b._buf) return b._buf;
      if (typeof b === 'string') return Buffer.from(b);
      return Buffer.alloc(0);
    }

const sandbox = {
  window: { XMLHttpRequest: MockXHR, __spUpShim: undefined },
  document: documentMock,
  Blob: MockBlob,
  File: MockFile,
  FormData: MockFormData,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console,
  JSON: JSON,
  URL: URL,
};
sandbox.window.XMLHttpRequest = MockXHR;
vm.createContext(sandbox);

const shimSrc = fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'web', 'custom', 'upload-shim.js'), 'utf-8');
vm.runInContext(shimSrc, sandbox);
console.log('shim loaded, __spUpShim =', sandbox.window.__spUpShim);

server.listen(PORT, () => {
  // 构造一个 2.6MB 的“文件”
  const totalBytes = 2_600_000;
  const bytes = Buffer.alloc(totalBytes, 7);
  const file = new MockFile([bytes], 'test_backup.zip', { type: 'application/zip' });
  file.slice = function (a, b) { return new MockBlob([bytes.slice(a, b)], { type: 'application/zip' }); };

  const fd = new MockFormData();
  fd.append('file', file);

  const xhr = new MockXHR();
  let done = false;
  xhr.onload = function () {
    if (done) return; done = true;
    console.log('>>> ORIG XHR onload fired. status=', xhr.status, 'responseText=', xhr.responseText.slice(0, 120));
    const j = JSON.parse(xhr.responseText);
    const assembled = path.join(BACKUP, 'test_backup.zip');
    fs.readFile(assembled, (e, buf) => {
      console.log('ASSEMBLED file exists:', !e, 'size:', e ? 0 : buf.length, 'matches:', !e && buf.length === totalBytes);
      cleanup();
      process.exit(0);
    });
  };
  xhr.onerror = function () { if (done) return; done = true; console.log('>>> ORIG XHR onerror'); cleanup(); process.exit(1); };

  xhr.open('POST', 'http://127.0.0.1:' + PORT + '/api/panel/backup/uploadZipFile');
  xhr.setRequestHeader('x-sp-token', 'fake-token');
  // 关键：调用 window.XMLHttpRequest.prototype.send（被 shim 包裹）
  MockXHR.prototype.send.call(xhr, fd);
});

function cleanup() {
  try { fs.rmSync(BACKUP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { server.close(); } catch (e) {}
}
setTimeout(() => { console.log('TIMEOUT: onload never fired'); cleanup(); process.exit(2); }, 20000);
