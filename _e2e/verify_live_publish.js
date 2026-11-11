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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(3000);

  const inputs = await page.$$('input');
  if (inputs.length >= 2 && /login/i.test(page.url())) {
    await inputs[0].type(CRED.username || '');
    await inputs[1].type(CRED.password || '');
    await page.keyboard.press('Enter');
    await sleep(7000);
  }
  console.log('URL after login:', page.url().split('?')[0]);

  // open avatar menu (top-right) then 个性化设置
  await page.mouse.click(1640, 43);
  await sleep(1500);
  const openedPersonal = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '个性化设置');
    if (el) { el.click(); return true; }
    return false;
  });
  await sleep(2500);

  const settingsState = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      openedPersonal,
      hasRainCard: !!document.querySelector('[data-sp-rain-card]'),
      hasHoverCard: !!document.querySelector('[data-sp-hover-card]'),
      hasGearPopup: !!document.querySelector('.sp-feat-pop') || t.includes('打开万能窗口'),
      bodyHasRainText: t.includes('雨效'),
    };
  });
  console.log('SETTINGS:', JSON.stringify(settingsState));
  await page.screenshot({ path: path.join(__dirname, 'live-pub-settings.png') });

  // close dialog
  await page.keyboard.press('Escape');
  await sleep(1000);

  // open 系统应用 -> 迁移
  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(3000);
  const goTab = async (name) => {
    const ok = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('span, div')].find(e => e.children.length === 0 && (e.innerText || '').trim() === n);
      if (el) { el.click(); return true; }
      return false;
    }, name);
    await sleep(2500);
    return ok;
  };
  console.log('切到迁移:', await goTab('迁移'));
  const migrateState = await page.evaluate(() => ({
    hasRestoreCard: !!document.querySelector('[data-sp-restore-card]'),
    restoreText: document.body.innerText.includes('数据恢复（服务器已有备份）'),
  }));
  console.log('MIGRATE:', JSON.stringify(migrateState));
  await page.screenshot({ path: path.join(__dirname, 'live-pub-migrate.png') });

  console.log('PAGE_ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
  await browser.close();
})();
