const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('https://subtitle-manager.app.workbuddy.host/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  // 抓眼球相关的 DOM 结构与 transform
  const dump = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span,svg').forEach(el => {
      const st = getComputedStyle(el);
      if (/translate|rotate/.test(st.transform) && st.transform !== 'none') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width < 40 && r.height > 0 && r.height < 40) {
          out.push({ cls: (el.className || '').toString().slice(0, 60), tag: el.tagName, t: st.transform, w: Math.round(r.width), h: Math.round(r.height), bg: st.backgroundColor, radius: st.borderRadius });
        }
      }
    });
    return out.slice(0, 20);
  });
  console.log('transform 元素:', JSON.stringify(dump, null, 1));
  for (const [x, y, name] of [[1430, 30, 'tr'], [10, 880, 'bl'], [720, 450, 'center']]) {
    await page.mouse.move(x, y);
    await sleep(900);
    await page.screenshot({ path: 'sub-eye-' + name + '.png', clip: { x: 60, y: 200, width: 520, height: 400 } });
  }
  await browser.close();
})();
