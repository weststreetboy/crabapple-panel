// 子域名模式真实浏览器验证：<id>.links.xuers.dpdns.org 打开单页应用是否正常渲染
// 用 Chrome 的 --host-resolver-rules 把子域名指到本地 dev server
const puppeteer = require("puppeteer-core");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 8789);
const SHARE = process.env.SUB_SUFFIX_FOR_TEST || "xuers.dpdns.org";

function req(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = Object.assign({}, opts.headers || {});
    if (opts.host) headers.host = opts.host; else headers.host = "127.0.0.1:" + PORT;
    let payload;
    if (opts.body != null) payload = Buffer.from(opts.body);
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: opts.method || "GET", headers }, (res) => {
      const cs = []; res.on("data", (c) => cs.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(cs).toString("utf8") }));
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}
async function api(p, method, body, token) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await req(p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return JSON.parse(r.body);
}

(async () => {
  const login = await api("/api/login", "POST", { password: "test123" });
  const tk = login.data.token;
  const mk = await api("/api/links", "POST", {
    url: "https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3",
    plan: "1d", name: "browser-sub", mode: "proxy",
  }, tk);
  const { id, user, pass, shareUrl } = mk.data;
  console.log("link:", id, shareUrl);

  const sub = id + "." + SHARE;
  const b = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--proxy-server=direct://", "--proxy-bypass-list=*",
      "--host-resolver-rules=MAP " + sub + " 127.0.0.1:" + PORT],
    defaultViewport: { width: 1280, height: 800 },
  });
  const p = await b.newPage();
  const errs = [], bad = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  p.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });

  const gateUrl = "http://" + sub + ":" + PORT + "/";
  await p.goto(gateUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("gate title:", await p.title());
  await p.type('input[name="u"]', user);
  await p.type('input[name="p"]', pass);
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => null),
    p.click('button[type="submit"]'),
  ]);
  await new Promise((r) => setTimeout(r, 6000));

  const info = await p.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 200),
    cards: document.querySelectorAll("[class*=item],[class*=card]").length,
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log("pageerror:", JSON.stringify(errs.slice(0, 4)));
  console.log("4xx/5xx:", JSON.stringify(bad.slice(0, 6)));
  await p.screenshot({ path: path.join(__dirname, "shot-subdomain.png") });
  console.log("http status of doc:", (await api("/api/links", "GET", null, tk)).data.find(x => x.id === id).visits);
  await b.close();
})();
