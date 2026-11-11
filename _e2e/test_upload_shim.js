// 在 Node 里对 upload-shim.js 做确定性单测：
// 1) 模拟浏览器 XMLHttpRequest / Blob / File
// 2) 加载 shim
// 3) 模拟 Naive UI 调用 new XHR().open('POST', uploadUrl).setRequestHeader('x-sp-token').send(formData)
// 4) 模拟服务端：收到分片裸流，最后一片回 200 {"code":0,"data":{"fileName":...}}
// 断言：服务端收到 N 片 chunked raw octet-stream；原 XHR 最终 onload 拿到 200 + JSON

const fs = require("fs");
const path = require("path");

// ---- 模拟环境 ----
const captured = []; // 服务端视角：每次 shim 发来的请求

class MockXHR {
  constructor() {
    this.status = 0;
    this.statusText = "";
    this.responseText = "";
    this.response = "";
    this.readyState = 0;
    this.__headers = {};
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onloadend = null;
  }
  open(method, url) { this.__method = method; this.__url = url; }
  setRequestHeader(k, v) { this.__headers[k] = v; }
  send(body) {
    // 模拟服务端：把请求交给"服务端"处理（同步记录 + 异步回 200）
    const req = {
      method: this.__method, url: this.__url,
      headers: Object.assign({}, this.__headers),
      body: body, // Blob/Buffer
    };
    captured.push(req);
    const self = this;
    process.nextTick(() => {
      const isLast = req.headers["X-Chunk-Index"] &&
        req.headers["X-Chunk-Total"] &&
        (parseInt(req.headers["X-Chunk-Index"], 10) === parseInt(req.headers["X-Chunk-Total"], 10) - 1);
      const resp = isLast
        ? { code: 0, data: { fileName: "test.zip" }, msg: "OK" }
        : { code: 0, data: { chunk: parseInt(req.headers["X-Chunk-Index"], 10) }, msg: "chunk received" };
      self.status = 200;
      self.statusText = "OK";
      self.responseText = JSON.stringify(resp);
      self.response = JSON.stringify(resp);
      self.readyState = 4;
      if (self.onreadystatechange) self.onreadystatechange({});
      if (self.onload) self.onload({});
      if (self.onloadend) self.onloadend({});
    });
  }
}
global.XMLHttpRequest = MockXHR;
global.window = global;
global.Blob = class {
  constructor(parts, opts) { this.size = (parts[0] && parts[0].length) || 0; this.type = (opts && opts.type) || ""; }
  slice(start, end) { return new Blob([Buffer.alloc(Math.max(0, (end || this.size) - (start || 0)))], { type: this.type }); }
};
global.File = class extends Blob { constructor(parts, name, opts) { super(parts, opts); this.name = name; } };

// ---- 加载 shim ----
const code = fs.readFileSync(
  path.join(__dirname, "..", "sun-panel_v2.0.2-beta261101_windows_amd64", "web", "custom", "upload-shim.js"),
  "utf-8"
);
eval(code);

// ---- 模拟 Naive UI 上传 ----
const file = new File([Buffer.alloc(4 * 1024 * 1024)], "我的备份.zip", { type: "application/zip" });
const fd = { _m: {}, get(k) { return this._m[k]; } };
fd._m["file"] = file; // 模拟 FormData.get('file')

let result = null;
const xhr = new XMLHttpRequest();
xhr.onload = function () { result = { status: xhr.status, text: xhr.responseText }; };
xhr.open("POST", "/api/panel/backup/uploadZipFile");
xhr.setRequestHeader("x-sp-token", "real-token-xyz");
xhr.send(fd);

// 等异步完成
setTimeout(() => {
  console.log("captured requests:", captured.length);
  const chunked = captured.filter(c => c.headers["X-Chunk-Total"]);
  console.log("chunked requests:", chunked.length);
  chunked.forEach((c, i) => {
    console.log("  #" + i,
      "ct=" + c.headers["Content-Type"],
      "idx=" + c.headers["X-Chunk-Index"],
      "total=" + c.headers["X-Chunk-Total"],
      "fname=" + c.headers["X-File-Name"],
      "tok=" + c.headers["x-sp-token"],
      "bodyIsBlob=" + (c.body && typeof c.body === "object"));
  });
  const allOctet = chunked.every(c => (c.headers["Content-Type"] || "").startsWith("application/octet-stream"));
  const lastFired = result && result.status === 200 && JSON.parse(result.text).code === 0;
  console.log("all octet-stream:", allOctet);
  console.log("original XHR got 200 + code:0:", lastFired, result && result.text);
  const pass = chunked.length === Math.ceil(file.size / (1.5 * 1024 * 1024)) &&
               allOctet && lastFired && captured.every(c => c.headers["x-sp-token"] === "real-token-xyz");
  console.log(pass ? "SHIM TEST PASS" : "SHIM TEST FAIL");
  process.exit(pass ? 0 : 1);
}, 300);
