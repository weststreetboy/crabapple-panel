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
  // 等待恢复列表加载出按钮（最多 ~6s）
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    ok = await page.evaluate(() => !!document.querySelector('[data-sp-restore-card] .sp-ri-btn'));
    if (!ok) await sleep(600);
  }
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
