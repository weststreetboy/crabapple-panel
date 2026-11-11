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
  const html = await page.evaluate(() => {
    // 找包含彩色色块的容器
    const all = [...document.querySelectorAll('div')];
    const cand = all.filter(d => {
      const s = getComputedStyle(d);
      return /rgb\(108, 63, 245\)|rgb\(255, 155, 107\)|rgb\(232, 215, 84\)/.test(s.backgroundColor);
    });
    const root = cand.length ? cand[0].closest('div[class*="hidden"],div[class*="lg:"]') || cand[0].parentElement.parentElement : null;
    return { colors: cand.map(c => ({ bg: getComputedStyle(c).backgroundColor, cls: (c.className||'').toString().slice(0,80), html: c.outerHTML.slice(0, 700) })) };
  });
  console.log(JSON.stringify(html.colors, null, 1).slice(0, 6000));
  await browser.close();
})();
