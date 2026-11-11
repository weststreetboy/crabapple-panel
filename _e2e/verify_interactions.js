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

  // 个性化设置
  await page.mouse.click(1640, 43);
  await sleep(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText||'').trim() === '个性化设置');
    if (el) el.click();
  });
  await sleep(2800);

  const rainRes = await page.evaluate(() => {
    const card = document.querySelector('[data-sp-rain-card]');
    const off = card.querySelector('.sp-seg button[data-v="off"]');
    off.click();
    return { ls: localStorage.getItem('sp_rain_mode') };
  });
  console.log('雨效→关:', JSON.stringify(rainRes));

  const hoverRes = await page.evaluate(() => {
    const card = document.querySelector('[data-sp-hover-card]');
    const glow = card.querySelector('.sp-seg button[data-v="glow"]');
    glow.click();
    return { ls: localStorage.getItem('sp_hover_effect'), bodyClass: document.body.className };
  });
  console.log('悬停→发光:', JSON.stringify(hoverRes));

  // 关闭
  await page.keyboard.press('Escape');
  await sleep(800);

  // 迁移
  await page.mouse.click(1640, 43);
  await sleep(1400);
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
  await goTab('迁移');
  await sleep(1200);

  const confirmRes = await page.evaluate(() => {
    const btn = document.querySelector('[data-sp-restore-card] .sp-ri-btn');
    if (!btn) return { found:false };
    const before = btn.textContent.trim();
    btn.click();
    const after = btn.textContent.trim();
    const danger = btn.classList.contains('sp-danger');
    const confirmAttr = btn.getAttribute('data-confirm');
    return { found:true, before, after, danger, confirmAttr };
  });
  console.log('恢复两阶段确认:', JSON.stringify(confirmRes));

  await browser.close();
})();
