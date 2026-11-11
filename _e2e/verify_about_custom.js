const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);

  // ---- 1) 关于页：检查新版本 ----
  console.log('click 关于', await clickText('关于'));
  await sleep(2500);
  console.log('click 检查新版本', await clickText('检查新版本'));
  await sleep(3000);
  const aboutText = await page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ');
    const toast = [...document.querySelectorAll('[class*="message"], [class*="notification"], [class*="toast"]')]
      .map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 5);
    return { hasFail: /检查更新失败|操作失败/.test(body), toast, tail: body.slice(-260) };
  });
  console.log('ABOUT', JSON.stringify(aboutText, null, 1));
  await page.screenshot({ path: 'about-after.png' });

  // ---- 2) 全局设置：自定义 JS 保存 ----
  await page.keyboard.press('Escape'); await sleep(800);
  console.log('click 全局设置', await clickText('全局设置'));
  await sleep(3000);
  const saveInfo = await page.evaluate(() => {
    const areas = [...document.querySelectorAll('textarea')].map(t => ({ v: (t.value || '').slice(0, 30), n: t.value.length }));
    const btns = [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim()).filter(t => t === '保存').length;
    return { textareas: areas.length, lens: areas.map(a => a.n), saveBtns: btns };
  });
  console.log('SETTING', JSON.stringify(saveInfo));
  // 点最后一个"保存"（自定义 JS/CSS 那一块）
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '保存');
    if (!btns.length) return 0;
    btns[btns.length - 1].click();
    return btns.length;
  });
  console.log('点击保存按钮数', clicked);
  await sleep(3500);
  const after = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-300));
  console.log('AFTER-SAVE tail:', after);
  await page.screenshot({ path: 'setting-after.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
