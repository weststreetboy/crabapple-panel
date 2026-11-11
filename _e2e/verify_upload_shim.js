const puppeteer = require('puppeteer-core');
const { login, launch } = require('./helper');
const fs = require('fs');
const path = require('path');

const ZIP = path.join(__dirname, 'test_backup.zip');
const zipB64 = fs.readFileSync(ZIP).toString('base64');

(async () => {
  process.env.BASE = 'http://127.0.0.1:3099';
  const { browser, page } = await launch();
  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push('[c] ' + t.slice(0, 220)); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message.slice(0, 200)));

  await login(page);
  console.log('LOGGED IN');

  const result = await page.evaluate(async (zipB64) => {
    // 探测 shim 是否真的包住了 XMLHttpRequest 原型
    const probe = {
      hasShimFlag: !!window.__spUpShim,
      sendWrapped: /__spUrl/.test(XMLHttpRequest.prototype.send.toString()),
      openWrapped: /__spUrl/.test(XMLHttpRequest.prototype.open.toString()),
    };
    // 重新登录拿 token（与 app 同款）
    const lg = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@sun.cc', password: 'Fiery.813' })
    });
    const lj = await lg.json();
    const token = (lj.data && lj.data.token) || lj.token;
    if (!token) return { ok: false, why: 'no token', login: lj };

    // 还原 zip 字节为 Blob（浏览器原生支持 slice）
    const bin = atob(zipB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const file = new File([blob], 'test_backup.zip', { type: 'application/zip' });

      const fd = new FormData();
      fd.append('file', file);

    const probe2 = probe;

    return await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      let done = false;
      const finish = (o) => { if (!done) { done = true; resolve(Object.assign({ _probe: probe2 }, o)); } };
      xhr.onload = () => {
        try {
          const txt = xhr.responseText || '';
          let j = null; try { j = JSON.parse(txt); } catch (e) {}
          finish({ ok: true, status: xhr.status, resp: j, shim: !!window.__spUpShim,
                   banner: (document.getElementById('sp-up-banner') || {}).innerText || '' });
        } catch (e) { finish({ ok: true, status: xhr.status, raw: xhr.responseText }); }
      };
      xhr.onerror = () => finish({ ok: false, why: 'xhr onerror', status: xhr.status });
      xhr.ontimeout = () => finish({ ok: false, why: 'xhr ontimeout' });
      const to = setTimeout(() => finish({ ok: false, why: 'promise timeout 80s' }), 80000);
      xhr.addEventListener('loadend', () => clearTimeout(to));
      xhr.open('POST', '/api/panel/backup/uploadZipFile');
      xhr.setRequestHeader('x-sp-token', token);
      xhr.send(fd);
    });
  }, zipB64);

  console.log('UPLOAD RESULT:', JSON.stringify(result, null, 2));

  // 确认服务端确实落盘
  await new Promise(r => setTimeout(r, 1000));
  const fin = await page.evaluate(() => {
    const banner = document.getElementById('sp-up-banner');
    return { shim: !!window.__spUpShim, banner: banner ? (banner.style.display !== 'none' ? banner.innerText : '(hidden)') : '(none)' };
  });
  console.log('FINAL:', JSON.stringify(fin));
  console.log('--- browser logs ---');
  logs.slice(-20).forEach(l => console.log(l));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
