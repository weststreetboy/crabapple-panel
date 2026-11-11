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
  await sleep(1500);

  const info = await page.evaluate(() => {
    const card = document.querySelector('[data-sp-restore-card]');
    const c = card ? getComputedStyle(card) : null;
    const name = card ? card.querySelector('.sp-ri-name') : null;
    const nameC = name ? getComputedStyle(name) : null;
    const note = card ? card.querySelector('.sp-note') : null;
    const noteC = note ? getComputedStyle(note) : null;
    const segBtn = card ? card.querySelector('.sp-seg button') : null;
    const segC = segBtn ? getComputedStyle(segBtn) : null;
    return {
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      cardBg: c ? c.backgroundColor : null,
      cardColor: c ? c.color : null,
      nameColor: nameC ? nameC.color : null,
      nameBg: nameC ? nameC.backgroundColor : null,
      noteColor: noteC ? noteC.color : null,
      segBtnColor: segC ? segC.color : null,
      segBtnBg: segC ? segC.backgroundColor : null,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
