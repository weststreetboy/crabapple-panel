const { login, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  await login(page);
  const info = await page.evaluate(() => {
    const out = { keys: [], probes: [] };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      out.keys.push(k + ' => ' + (v.length > 60 ? v.slice(0, 60) + '…' : v));
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      out.keys.push('S:' + k);
    }
    return out;
  });
  console.log('STORAGE:', JSON.stringify(info, null, 1));

  // 用页面内的 fetch 直接打本地授权接口，看 token 头是否被接受
  const probe = await page.evaluate(async () => {
    let tok = '';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || '';
      if (/token/i.test(k) && v.length > 15) { tok = v.replace(/^"|"$/g, ''); break; }
      try {
        const o = JSON.parse(v);
        if (o && o.token && String(o.token).length > 15) { tok = String(o.token); break; }
      } catch (e) {}
    }
    const r = await fetch('/api/localAuth/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sp-token': tok }, body: '{}',
    });
    const j = await r.json();
    return { tok: tok.slice(0, 10), code: j.code, msg: j.msg };
  });
  console.log('PROBE:', JSON.stringify(probe));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
