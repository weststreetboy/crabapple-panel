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

  // 打开头像菜单 → 主题 子菜单
  await page.mouse.click(1640, 43);
  await sleep(1200);
  const themeItems = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText||'').trim() === '主题');
    if (el) el.click();
    return [...document.querySelectorAll('*')].filter(e => e.children.length === 0).map(e => (e.innerText||'').trim()).filter(t => /暗|深|亮|浅|跟随|dark|light/i.test(t));
  });
  console.log('主题子项:', JSON.stringify(themeItems));
  // 点「暗色 / 深色」
  const clickedDark = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /暗色|深色|dark/i.test((e.innerText||'').trim()));
    if (el) { el.click(); return (e.innerText||'').trim(); }
    return null;
  });
  console.log('切到暗色:', clickedDark);
  await sleep(2000);

  // 打开迁移
  await page.mouse.click(1640, 43);
  await sleep(1200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === '系统应用');
    if (el) el.click();
  });
  await sleep(2200);
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
  await sleep(1000);

  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const card = document.querySelector('[data-sp-restore-card]');
    const c = card ? getComputedStyle(card) : null;
    const name = card ? card.querySelector('.sp-ri-name') : null;
    const nameC = name ? getComputedStyle(name) : null;
    const note = card ? card.querySelector('.sp-note') : null;
    const noteC = note ? getComputedStyle(note) : null;
    const segOn = card ? card.querySelector('.sp-seg button.sp-on') : null;
    const segOnC = segOn ? getComputedStyle(segOn) : null;
    return {
      htmlHasDark: html.classList.contains('dark'),
      cardBg: c ? c.backgroundColor : null,
      nameColor: nameC ? nameC.color : null,
      noteColor: noteC ? noteC.color : null,
      segOnColor: segOnC ? segOnC.color : null,
      segOnBg: segOnC ? segOnC.backgroundColor : null,
    };
  });
  console.log('暗色模式:', JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'shot-verify-migrate-dark.png') });
  await browser.close();
})();
