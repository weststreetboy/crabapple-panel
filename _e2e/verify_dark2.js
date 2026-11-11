const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1700, height: 1000 },
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(1500);
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
    await sleep(2500);
    return ok;
  };
  await goTab('迁移');
  await sleep(1200);

  const light = await page.evaluate(() => {
    const card = document.querySelector('[data-sp-restore-card]');
    const name = card ? card.querySelector('.sp-ri-name') : null;
    const note = card ? card.querySelector('.sp-note') : null;
    return {
      htmlDark: document.documentElement.classList.contains('dark'),
      name: name ? getComputedStyle(name).color : null,
      note: note ? getComputedStyle(note).color : null,
    };
  });
  console.log('亮色:', JSON.stringify(light));

  // 强制 html.dark，验证覆盖规则生效（真实暗色下 n-card 背景也会变深，此处仅验证文本覆盖）
  const dark = await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    const card = document.querySelector('[data-sp-restore-card]');
    const name = card ? card.querySelector('.sp-ri-name') : null;
    const note = card ? card.querySelector('.sp-note') : null;
    return {
      htmlDark: document.documentElement.classList.contains('dark'),
      name: name ? getComputedStyle(name).color : null,
      note: note ? getComputedStyle(note).color : null,
    };
  });
  console.log('暗色(覆盖后):', JSON.stringify(dark));
  await page.screenshot({ path: path.join(__dirname, 'shot-verify-migrate-forcedark.png') });

  await browser.close();
})();
