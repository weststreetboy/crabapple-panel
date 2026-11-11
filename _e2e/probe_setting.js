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
  page.on('request', r => { if (/uploadImg|siteSetting|saveSite|globalSetting/.test(r.url())) api.push(r.method()+' '+r.url().replace(BASE,'')+' body='+(r.postData()||'').slice(0,120)); });
  page.on('response', async r => { if (/uploadImg|siteSetting|saveSite/.test(r.url())) { let t=''; try{t=(await r.text()).slice(0,160);}catch(e){} api.push('<- '+r.status()+' '+r.url().replace(BASE,'')+' '+t); } });
  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4000);
  await page.mouse.click(1457, 43); await sleep(1500);
  const clickText = t => page.evaluate((x)=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===x);if(!els.length)return false;els[0].click();return true;}, t);
  console.log('click 全局设置', await clickText('全局设置'));
  await sleep(2500);
  const dump = await page.evaluate(() => {
    const files = [...document.querySelectorAll('input[type=file]')].map((i, idx) => ({
      idx, accept: i.accept, name: i.name,
      parentText: (i.closest('div') || {}).innerText ? i.closest('div').innerText.replace(/\s+/g,' ').slice(0, 60) : ''
    }));
    const tabs = [...document.querySelectorAll('.n-tabs-tab, [class*="tab"]')].map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 15);
    return { files, tabs, text: document.body.innerText.replace(/\s+/g,' ').slice(0, 600) };
  });
  console.log('DUMP', JSON.stringify(dump, null, 1));
  await page.screenshot({ path: 'setting-page.png' });
  console.log('API', JSON.stringify(api.slice(0, 9)));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
