const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist-linux', 'runtime', 'auto_login.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/MicroAppApi|ERR_NAME_NOT_RESOLVED/.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));

  await page.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = function (u) { window.__opened.push(String(u)); return { closed: false, focus() {}, close() {} }; };
  });

  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(3000);

  // 若停在登录页则填入（不打印凭据）
  let inputs = await page.$$('input');
  if (inputs.length >= 2 && /login/i.test(page.url())) {
    await inputs[0].type(CRED.username || '');
    await inputs[1].type(CRED.password || '');
    await page.keyboard.press('Enter');
    await sleep(7000);
  }
  console.log('登录后 URL:', page.url().split('?')[0]);

  await page.mouse.click(1640, 43);
  await sleep(1800);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(3000);

  const goTab = async (name) => {
    const ok = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('span.ml-2, span')].find(e => (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2500);
    return ok;
  };

  console.log('切到迁移:', await goTab('迁移'));
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasNoPro: t.includes('没有PRO授权'), hasBackup: t.includes('备份'), hasRecovery: t.includes('恢复') };
  });
  console.log('迁移页状态:', JSON.stringify(state));
  await page.screenshot({ path: path.join(__dirname, 'live-migrate-unlocked.png') });

  const backupClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /备份/.test(b.innerText || ''));
    if (btn) { btn.click(); return (btn.innerText || '').trim().replace(/\s+/g, ' '); }
    return null;
  });
  console.log('点击备份:', backupClicked);
  await sleep(20000);
  const afterBackup = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' | '));
  console.log('备份后页面片段:', afterBackup.slice(0, 260));
  await page.screenshot({ path: path.join(__dirname, 'live-migrate-backup.png') });

  console.log('切到授权管理:', await goTab('授权管理'));
  await sleep(1800);
  const links = await page.evaluate(() => {
    const found = [];
    for (const label of ['授权官网', '功能比较', '查看常见问题']) {
      const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === label);
      if (btn) { btn.click(); found.push(label); }
    }
    return { found, opened: window.__opened };
  });
  console.log('外链结果:', JSON.stringify(links));
  await page.screenshot({ path: path.join(__dirname, 'live-auth-links.png') });

  await browser.close();
})();
