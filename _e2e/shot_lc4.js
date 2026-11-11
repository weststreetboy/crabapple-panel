const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const B = 'http://127.0.0.1:8787';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 180)));
  await page.goto(B + '/', { waitUntil: 'networkidle2' });
  await page.type('#username', 'admin'); await page.type('#password', 'Fiery.813');
  await page.click('#loginBtn'); await sleep(2000);
  await page.evaluate(() => document.querySelector('.nav-item[data-view="set"]').click());
  await sleep(400);
  await page.click('#totpToggle'); await sleep(2600);
  await page.screenshot({ path: 'lc4-2fa.png' });
  await page.keyboard.press('Escape'); await sleep(200);

  // 导出下载
  const dir = 'C:/Users/Administrator/AppData/Local/Temp/lc_dl';
  await page._client().send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await page.click('#expCsv'); await sleep(1500);
  await page.click('#expJson'); await sleep(1500);

  // 移动端
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await m.goto(B + '/', { waitUntil: 'networkidle2' });
  await m.type('#username', 'admin'); await m.type('#password', 'Fiery.813');
  await m.click('#loginBtn'); await sleep(2200);
  await m.screenshot({ path: 'lc4-mobile-app.png' });
  await m.evaluate(() => document.querySelector('.nav-item[data-view="set"]').click());
  await sleep(400);
  await m.screenshot({ path: 'lc4-mobile-set.png', fullPage: true });
  console.log('ERR:', errs.length ? errs.join('\n') : '无');
  await browser.close();
})();
