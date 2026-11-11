const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport:{width:1700,height:1000} });
  const p = await b.newPage();
  await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3', {waitUntil:'networkidle2',timeout:150000});
  await sleep(6000);
  const r = await p.evaluate(() => ({
    url: location.href,
    bodyLen: document.body.innerText.length,
    head: document.body.innerText.slice(0,500),
    hasApp: !!document.querySelector('#app'),
    titleEls: [...document.querySelectorAll('[class*=title],[class*=name],[class*=Title]')].slice(0,15).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,80),txt:(e.innerText||'').trim().slice(0,40)}))
  }));
  console.log(JSON.stringify(r,null,1));
  await p.screenshot({path:'probe-home.png'});
  await b.close();
})();
