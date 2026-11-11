const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  await page.setRequestInterception(true);
  page.on('request', req => {
    // 模拟"云端站点访问不了"：直接掐断
    if (req.url().includes('auth.xuers.dpdns.org')) return req.abort('failed');
    req.continue();
  });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await login(page);
  await openLauncher(page);
  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2500));

  let txt = '';
  for (let i = 0; i < 20; i++) {
    txt = await page.evaluate(() => (document.querySelector('#la-cloud-txt') || {}).textContent || '');
    if (txt && !/检测中/.test(txt)) break;
    await new Promise(r => setTimeout(r, 400));
  }
  const st = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    return {
      cloud: document.querySelector('#la-cloud-txt')?.textContent,
      state: el?.querySelector('#la-state')?.textContent,
      code: el?.querySelector('#la-code')?.textContent,
      activateBtn: el?.querySelector('#la-activate')?.textContent,
    };
  });
  console.log('OFFLINE RESULT:', JSON.stringify(st, null, 1));
  await page.screenshot({ path: 'shot-auth-cloud-offline.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
