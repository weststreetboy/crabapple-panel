const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(5000);

  await page.mouse.click(1660, 43); await sleep(1200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2500);
  const info = await page.evaluate(() => ({
    hasMigrate: document.body.innerText.includes('迁移'),
    text: document.body.innerText.slice(0, 600),
    menus: [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && ['迁移', '授权管理', '全局设置'].includes((e.innerText || '').trim())).map(e => e.tagName + '.' + e.className + ':' + e.innerText.trim()),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'shot-probe-menu.png' });
  await browser.close();
})();
