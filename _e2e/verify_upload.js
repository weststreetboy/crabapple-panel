const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  await page.goto(BASE + '/login' + SC, { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);

  const b64 = fs.readFileSync(path.resolve('test-logo.ico')).toString('base64');
  const res = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append('type', '4');
    fd.append('imgfile', new Blob([arr], { type: 'image/x-icon' }), 'my-logo.ico');
    let tok = localStorage.getItem('AUTH_TOKEN') || '';
    for (let i = 0; !tok && i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      try {
        const o = JSON.parse(v);
        if (o && o.token && String(o.token).length > 30) { tok = o.token; break; }
        if (o && o.state && o.state.token) { tok = o.state.token; break; }
      } catch (e) {}
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v) && v.length > 30) { tok = v; break; }
    }
    if (!tok) return { err: 'no token', keys: Object.keys(localStorage) };
    const r = await fetch('/api/file/uploadImg', { method: 'POST', headers: { 'x-sp-token': tok }, body: fd });
    const j = await r.json();
    // 再用原来的 token 头试一次，模拟修复前的行为做对照
    const fd2 = new FormData();
    fd2.append('type', '4');
    fd2.append('imgfile', new Blob([arr], { type: 'image/x-icon' }), 'my-logo2.ico');
    const r2 = await fetch('/api/file/uploadImg', { method: 'POST', headers: { 'token': tok }, body: fd2 });
    const j2 = await r2.json();
    return { withXsp: j, withRawToken: j2, tokenLen: tok.length };
  }, b64);
  console.log('RESULT', JSON.stringify(res));
  if (res.withXsp && res.withXsp.code === 0 && res.withXsp.data) {
    const url = BASE + res.withXsp.data.imageUrl;
    const rr = await page.goto(url);
    console.log('UPLOADED FILE', res.withXsp.data.imageUrl, 'HTTP', rr.status());
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
