const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const B = process.env.LC || 'http://127.0.0.1:8787';
const LOGO = 'C:/Users/Administrator/AppData/Local/Temp/lc-logo.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await page.goto(B + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(900);

  await page.type('#username', 'admin', { delay: 10 });
  await page.type('#password', 'Fiery.813', { delay: 10 });
  await page.click('#loginBtn');
  await sleep(2200);
  console.log('登录后 app 可见:', await page.evaluate(() => !document.getElementById('appView').hidden));
  console.log('列表条数:', await page.evaluate(() => document.querySelectorAll('.lic').length));
  await page.screenshot({ path: 'lc3-app.png' });

  // 设置页
  await page.evaluate(() => document.querySelector('.nav-item[data-view="set"]').click());
  await sleep(500);
  const fileInput = await page.$('#logoFile');
  await fileInput.uploadFile(LOGO);
  await sleep(900);
  await page.screenshot({ path: 'lc3-set.png', fullPage: true });
  await page.evaluate(() => document.getElementById('saveSite').click());
  await sleep(1200);
  console.log('保存后侧栏名:', await page.evaluate(() => document.getElementById('sideName').textContent));
  console.log('侧栏 logo 有图:', await page.evaluate(() => !!document.querySelector('#sideLogo img')));

  // 用户名校验弹窗
  await page.click('#editUsername');
  await sleep(500);
  await page.screenshot({ path: 'lc3-modal-user.png' });
  await page.keyboard.press('Escape');
  await sleep(300);

  // 2FA 弹窗
  await page.click('#totpToggle');
  await sleep(3000);
  await page.screenshot({ path: 'lc3-2fa.png' });
  await page.keyboard.press('Escape');
  await sleep(300);

  // 回到登录页看品牌是否生效
  await page.evaluate(() => location.reload());
  await sleep(1500);
  await page.screenshot({ path: 'lc3-login-branded.png' });

  // 移动端
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await m.goto(B + '/', { waitUntil: 'networkidle2' });

  await sleep(1200);
  await m.screenshot({ path: 'lc3-mobile.png' });
  await m.type('#username', 'admin'); await m.type('#password', 'Fiery.813');
  await m.click('#loginBtn'); await sleep(2200);
  await m.screenshot({ path: 'lc3-mobile-app.png' });

  console.log('ERR:', errs.length ? errs.join('\n') : '无');
  await browser.close();
})();
