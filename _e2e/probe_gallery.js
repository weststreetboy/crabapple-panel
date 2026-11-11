const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const api = [];
  page.on('request', r => { const u=r.url(); if (u.includes('/api/')) api.push(r.method()+' '+u.replace(BASE,'')+' '+JSON.stringify(r.headers()).slice(0,60)); });
  page.on('response', async r => { const u=r.url(); if (u.includes('/api/')||u.includes('/icon')) { if (api.length<200) { let t=''; try{t=(await r.text()).slice(0,120);}catch(e){} api.push('<- '+r.status()+' '+u.replace(BASE,'')+' '+t); } } });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4000);
  // 进入系统应用
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);
  console.log('click 图库', await clickText('图库'));
  await sleep(3000);
  const dump = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.n-tabs-tab, [class*="tab"]')].map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 20);
    const btns = [...document.querySelectorAll('button')].map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 30);
    const imgs = [...document.querySelectorAll('img')].map(e => ({src: e.src.slice(0,90), w: e.width, h: e.height, cls: e.className})).slice(0, 20);
    return { url: location.href, tabs, btns, imgs, text: document.body.innerText.replace(/\s+/g,' ').slice(0, 900) };
  });
  console.log('DUMP', JSON.stringify(dump, null, 1));
  await page.screenshot({ path: 'gallery-page.png' });
  console.log('API', JSON.stringify(api.slice(0, 30), null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
