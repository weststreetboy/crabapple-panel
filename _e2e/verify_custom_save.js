const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const hits = [];
  page.on('response', async r => {
    const u = r.url();
    if (/CustomJsAndCss|proAuth/.test(u)) {
      let t = ''; try { t = (await r.text()).slice(0, 160); } catch (e) {}
      hits.push(r.status() + ' ' + u.replace(BASE, '') + ' :: ' + t);
    }
  });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);
  await clickText('全局设置'); await sleep(3000);
  // 观察 toast 文本
  await page.evaluate(() => {
    window.__toasts = [];
    const obs = new MutationObserver(() => {
      document.querySelectorAll('.n-message, [class*="message__content"]').forEach(e => {
        const t = (e.innerText || '').trim();
        if (t && !window.__toasts.includes(t)) window.__toasts.push(t);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  const n = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '保存');
    btns[btns.length - 1].click();
    return btns.length;
  });
  await sleep(4000);
  const toasts = await page.evaluate(() => window.__toasts);
  console.log('保存按钮数', n);
  console.log('TOASTS', JSON.stringify(toasts));
  console.log('API', JSON.stringify(hits, null, 1));
  await page.screenshot({ path: 'setting-save.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
