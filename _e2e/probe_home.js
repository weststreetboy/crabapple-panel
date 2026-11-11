const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('12345678');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));

  // 点击右上角两个图标按钮
  const btns = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.cursor === 'pointer' && el.children.length <= 3) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 && r.left > 900) res.push({ cls: el.className.toString().slice(0, 80), x: r.left, y: r.top, w: r.width, html: el.outerHTML.slice(0, 120) });
      }
    });
    return res;
  });
  console.log('TOP-RIGHT:', JSON.stringify(btns, null, 1));

  // 打开四宫格
  const box = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).cursor === 'pointer' && r.top < 70 && r.left > 1300 && r.width < 60;
    });
    if (!els.length) return null;
    const r = els[els.length - 1].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  console.log('grid btn', box);
  if (box) {
    await page.mouse.click(box.x, box.y);
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'shot-applauncher.png' });
    const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
    console.log('after click:', txt);
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
