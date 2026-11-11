const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport:{width:1700,height:1000} });
  const p = await b.newPage();
  await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3', {waitUntil:'networkidle2',timeout:150000});
  await sleep(4000);
  const r = await p.evaluate(() => {
    const want = ['GitHub','Bilibili','百度','系统监控','识字工作台','rdgen 面板','fnOS 飞牛','常用','自建服务'];
    const out = [];
    for (const w of want) {
      const els = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && (e.textContent||'').trim()===w);
      out.push({text:w, count:els.length, samples: els.slice(0,2).map(e=>({
        tag:e.tagName, cls:e.className, parentCls:(e.parentElement||{}).className,
        gparentCls:(e.parentElement&&e.parentElement.parentElement||{}).className,
        html:e.parentElement?e.parentElement.outerHTML.slice(0,420):''
      }))});
    }
    return out;
  });
  console.log(JSON.stringify(r,null,1).slice(0,9000));
  await b.close();
})();
