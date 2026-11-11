const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  const api = [];
  page.on('request', r => { if (/uploadImg|saveSiteSetting|saveSite/.test(r.url())) api.push('REQ '+r.method()+' '+r.url().replace(BASE,'')+' hdr-token='+(r.headers()['x-sp-token']?'x-sp':'NONE')); });
  page.on('response', async r => { if (/uploadImg|saveSiteSetting|saveSite/.test(r.url())) { let t=''; try{t=(await r.text()).slice(0,200);}catch(e){} api.push('RES '+r.status()+' '+r.url().replace(BASE,'')+' '+t); } });

  await page.goto(BASE + '/login', { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4000);
  await page.mouse.click(1457, 43); await sleep(1200);
  await page.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()==='全局设置');els[0].click();});
  await sleep(2500);

  // 上传 ICO
  const fileInputs = await page.$$('input[type=file]');
  console.log('file inputs', fileInputs.length);
  await fileInputs[0].uploadFile(path.resolve('test-logo.ico'));
  await sleep(4000);
  console.log('after upload API', JSON.stringify(api, null, 1));

  // 点保存（站点设置卡片里的第一个保存）
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => (b.innerText||'').trim() === '保存');
    if (!btns.length) return 'no save button';
    btns[0].click();
    return 'clicked ' + btns.length;
  });
  console.log('save:', clicked);
  await sleep(3000);
  console.log('after save API', JSON.stringify(api.slice(-4), null, 1));
  const toast = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').match(/保存成功|保存失败|失败|成功/g));
  console.log('toast:', JSON.stringify(toast));
  await page.screenshot({ path: 'logo-after.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
