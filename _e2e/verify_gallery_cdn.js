const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  let iconReq = 0, iconFail = 0, nasReq = 0, nasFail = 0;
  page.on('response', r => {
    const u = r.url();
    if (u.includes('/uploads/iconlib/')) { iconReq++; if (r.status() >= 400) iconFail++; }
    if (u.includes('nasicon.top')) { nasReq++; if (r.status() >= 400) nasFail++; }
  });
  page.on('requestfailed', r => { if (r.url().includes('nasicon')) nasFail++; });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);
  console.log('click 图库', await clickText('图库'));
  await sleep(6000);
  const stat = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter(i => i.src.includes('iconlib'));
    const ok = imgs.filter(i => i.naturalWidth > 0).length;
    return { iconlibImgs: imgs.length, loaded: ok, broken: imgs.length - ok,
             texts: document.body.innerText.replace(/\s+/g,' ').slice(0, 160) };
  });
  console.log('STAT', JSON.stringify(stat));
  console.log('NET iconlib req=%d fail=%d | nasicon req=%d fail=%d', iconReq, iconFail, nasReq, nasFail);
  await page.screenshot({ path: 'gallery-cdn.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
