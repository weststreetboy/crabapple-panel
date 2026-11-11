const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],
    defaultViewport:{width:1500,height:1000} });
  const p = await b.newPage();
  await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3', { waitUntil:'networkidle2', timeout:90000 });
  await new Promise(r=>setTimeout(r,4000));
  const info = await p.evaluate(() => {
    const txt = document.body.innerText;
    return { len: txt.length, head: txt.slice(0, 260) };
  });
  console.log(JSON.stringify(info));
  await b.close();
})();
