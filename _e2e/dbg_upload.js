const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'https://daye-nav.app.workbuddy.host';
const SC = process.env.SC || '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1500,height:1000} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  let phase = 'boot';
  const reqs = [];
  page.on('request', r => { if (r.method() === 'POST') reqs.push(phase + ' ' + r.url().replace(BASE,'').slice(0,60)); });
  page.on('response', async r => { if (/uploadImg/.test(r.url())) { let t=''; try{t=(await r.text()).slice(0,200);}catch(e){} reqs.push(phase+' <- '+r.status()+' '+t); } });

  await page.goto(BASE + '/login' + SC, { waitUntil:'networkidle2', timeout:90000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc'); await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter'); await sleep(4500);
  await page.mouse.click(1457, 43); await sleep(1200);
  await page.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()==='全局设置');els[0].click();});
  await sleep(2500);
  phase = 'pre';
  // 打印 ICO 上传控件周边 DOM
  const dom = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[type=file]')];
    return ins.map((i, k) => ({ k, accept: i.accept, hidden: i.offsetParent === null, html: (i.parentElement.parentElement || i.parentElement).outerHTML.slice(0, 700) }));
  });
  console.log('DOM', JSON.stringify(dom.map(d => ({k:d.k, accept:d.accept, hidden:d.hidden})), null, 1));
  console.log('DOM0', dom[0].html.slice(0, 500));

  phase = 'upload';
  const files = await page.$$('input[type=file]');
  await files[0].uploadFile(path.resolve('test-logo.ico'));
  await sleep(5000);
  const st = await page.evaluate(() => {
    const i = document.querySelector('input[type=file]');
    return { files: i.files ? i.files.length : -1, name: i.files && i.files[0] ? i.files[0].name : '' };
  });
  console.log('INPUT STATE', JSON.stringify(st));
  console.log('POSTS', JSON.stringify(reqs.filter(x => !/getList|getByKey|getSetting|getInfo|getSite/.test(x)).slice(0, 12), null, 1));
  await page.screenshot({ path: 'logo-debug.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
