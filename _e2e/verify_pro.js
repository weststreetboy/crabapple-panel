const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { await d.accept(); });
  await login(page);
  await openLauncher(page);

  // 账号管理
  await clickText(page, '账号管理');
  await new Promise(r => setTimeout(r, 1800));
  const acc = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const i = t.indexOf('账号管理');
    return { hasNoPro: /非\s?PRO/.test(t), hasPro: /PRO/.test(t), snippet: t.slice(i, i + 260) };
  });
  console.log('ACCOUNT PAGE:', JSON.stringify(acc, null, 1));

  // 授权管理
  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2200));
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return 'not mounted';
    const rt = el.querySelector('#la-state').textContent;
    const meta = el.querySelector('#la-meta').textContent;
    const f = el.querySelector('.la-foot').getBoundingClientRect();
    const w = el.getBoundingClientRect();
    return { state: rt, meta, footBottomGap: Math.round(w.bottom - f.bottom), panelH: Math.round(w.height) };
  });
  console.log('PANEL:', JSON.stringify(panel, null, 1));
  await page.screenshot({ path: 'shot-auth-v2.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
