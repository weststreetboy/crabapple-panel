const { login, openLauncher, clickText, launch } = require('./helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODE = 'SPL-0-2C75C-4C6E2'; // 永久码，用来收尾恢复原状态

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { await d.accept(); });

  await login(page);
  // 先注销，回到未授权态
  const rev = await page.evaluate(async () => {
    let tok = '';
    try { tok = (JSON.parse(localStorage.getItem('AUTH_TOKEN')) || {}).data.token; } catch (e) {}
    const r = await fetch('/api/localAuth/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sp-token': tok },
      body: JSON.stringify({ revoke: true }),
    });
    return r.json();
  });
  console.log('注销:', JSON.stringify(rev));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);

  await openLauncher(page);
  await clickText(page, '授权管理');
  await sleep(2800);

  const before = await page.evaluate(() => {
    const b = document.getElementById('sp-lic-activate-btn');
    const cs = b ? getComputedStyle(b) : null;
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    return {
      text: (host?.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
      btn: b ? { txt: b.textContent.trim(), cls: b.className, bg: cs.backgroundColor } : null,
      panel: !!document.querySelector('.la-wrap'),
    };
  });
  console.log('未授权:', JSON.stringify(before, null, 1));
  await page.screenshot({ path: 'shot-lic-off.png' });

  await page.evaluate(() => document.getElementById('sp-lic-activate-btn').click());
  await sleep(700);
  await page.screenshot({ path: 'shot-lic-dialog2.png' });
  await page.type('#sp-lic-input', CODE, { delay: 10 });
  await page.evaluate(() => document.getElementById('sp-lic-ok').click());
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await sleep(4000);

  await page.mouse.click(1397, 43);
  await sleep(1300);
  await clickText(page, '授权管理');
  await sleep(2600);
  const after = await page.evaluate(() => {
    const host = document.querySelector('.app-starter-modal-content .n-layout-content .fade-in-animation');
    return {
      text: (host?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
      btn: (document.getElementById('sp-lic-activate-btn') || {}).textContent || null,
      panel: !!document.querySelector('.la-wrap'),
    };
  });
  console.log('恢复后:', JSON.stringify(after, null, 1));
  await page.screenshot({ path: 'shot-lic-restored.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
