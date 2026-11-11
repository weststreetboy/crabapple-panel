const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED = JSON.parse(fs.readFileSync(path.join(__dirname,'..','dist-linux','runtime','auto_login.json'),'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport:{width:1700,height:1000} });
  const p = await b.newPage();
  await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3', {waitUntil:'networkidle2',timeout:150000});
  await sleep(2500);
  if (/login/.test(p.url())) {
    const inp = await p.$$('input');
    await inp[0].type(CRED.username||''); await inp[1].type(CRED.password||'');
    await p.keyboard.press('Enter'); await sleep(7000);
  }
  const r = await p.evaluate(() => {
    const want = ['GitHub','Bilibili','百度','系统监控','识字工作台','rdgen 面板','fnOS 飞牛','常用','自建服务'];
    const out = [];
    for (const w of want) {
      const els = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && (e.textContent||'').trim()===w);
      out.push({text:w, count:els.length, samples: els.slice(0,1).map(e=>({
        tag:e.tagName, cls:String(e.className).slice(0,120),
        parentTag:e.parentElement&&e.parentElement.tagName,
        parentCls:String((e.parentElement||{}).className).slice(0,160),
        gcls:String((e.parentElement&&e.parentElement.parentElement||{}).className).slice(0,160),
        html:e.parentElement?e.parentElement.outerHTML.slice(0,500):''
      }))});
    }
    return {url:location.href, bodyLen:document.body.innerText.length, out};
  });
  console.log(JSON.stringify(r,null,1).slice(0,12000));
  await p.screenshot({path:'probe-home.png'});
  await b.close();
})();
