const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const B = process.env.LC || 'http://127.0.0.1:8787';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
  await page.goto(B + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  await page.mouse.move(1200, 120);
  await sleep(900);
  await page.screenshot({ path: 'lc2-login.png' });

  // 眼球跟随：右上 / 左下 / 中间
  for (const [x, y, tag] of [[1400, 60, 'tr'], [20, 860, 'bl'], [700, 460, 'cc']]) {
    await page.mouse.move(x, y);
    await sleep(800);
    await page.screenshot({ path: 'lc2-eye-' + tag + '.png', clip: { x: 40, y: 330, width: 620, height: 420 } });
  }

  // 密码偷看
  await page.type('#username', 'daye', { delay: 20 });
  await page.type('#password', 'Fiery.813', { delay: 20 });
  await page.mouse.move(300, 700);
  await sleep(1000);
  await page.screenshot({ path: 'lc2-peek.png' });
  // 显示密码 -> 捂眼
  await page.click('#togglePwd');
  await sleep(1000);
  await page.screenshot({ path: 'lc2-cover.png' });

  await page.click('#togglePwd');
  await page.click('#loginBtn');
  await sleep(2500);
  await page.screenshot({ path: 'lc2-app.png' });
  await page.evaluate(() => { document.querySelector('.nav-item[data-view="set"]').click(); });
  await sleep(600);
  await page.screenshot({ path: 'lc2-set.png', fullPage: true });

  // 弹窗：2FA
  await page.click('#totpToggle');
  await sleep(2600);
  await page.screenshot({ path: 'lc2-2fa.png' });
  await page.keyboard.press('Escape');

  console.log('ERR:', errs.length ? errs.join('\n') : '无');
  await browser.close();
})();
