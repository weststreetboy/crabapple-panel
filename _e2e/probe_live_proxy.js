const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new',
    args:['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1280,height:800} });
  const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  await p.goto('https://links.xuers.dpdns.org/s/fffffffffffffffffffffff0',{waitUntil:'networkidle2',timeout:90000});
  await new Promise(r=>setTimeout(r,8000));
  const t = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,120));
  console.log('TEXT:', t, '| ERR:', JSON.stringify(errs.slice(0,3)));
  await p.screenshot({path: path.join(__dirname,'shot-live-proxy-fixed.png')});
  await b.close();
})();
