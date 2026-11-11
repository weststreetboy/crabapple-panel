const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const SC = process.env.SC || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/MicroAppApi|ERR_NAME_NOT_RESOLVED/.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });

  await page.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = function (u) { window.__opened.push(String(u)); return { closed: false, focus() {}, close() {} }; };
  });

  await page.goto(BASE + '/login' + SC, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(2000);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(6000);

  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2500);

  const goTab = async (name) => {
    const ok = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('span.ml-2, span')].find(e => (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2200);
    return ok;
  };

  console.log('切到迁移:', await goTab('迁移'));
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasNoPro: t.includes('没有PRO授权'), hasBackup: t.includes('备份'), hasRecovery: t.includes('恢复') };
  });
  console.log('迁移页状态:', JSON.stringify(state));
  await page.screenshot({ path: path.join(__dirname, 'shot-migrate-unlocked.png') });

  const backupClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /备份/.test(b.innerText || ''));
    if (btn) { btn.click(); return (btn.innerText || '').trim().replace(/\s+/g, ' '); }
    return null;
  });
  console.log('点击备份:', backupClicked);
  await sleep(15000);
  await page.screenshot({ path: path.join(__dirname, 'shot-migrate-backup.png') });

  console.log('切到授权管理:', await goTab('授权管理'));
  await sleep(1500);
  const links = await page.evaluate(() => {
    const found = [];
    for (const label of ['授权官网', '功能比较', '查看常见问题']) {
      const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === label);
      if (btn) { btn.click(); found.push(label); }
    }
    return { found, opened: window.__opened };
  });
  console.log('外链结果:', JSON.stringify(links));
  await page.screenshot({ path: path.join(__dirname, 'shot-auth-links.png') });

  await browser.close();
})();
