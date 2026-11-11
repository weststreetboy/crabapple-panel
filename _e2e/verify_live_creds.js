const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://daye-nav.app.workbuddy.host';
const SC = '?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tryLogin(page, user, pass) {
  await page.goto(BASE + '/' + SC, { waitUntil: 'networkidle2', timeout: 150000 });
  await sleep(2500);
  const inputs = await page.$$('input');
  if (inputs.length < 2) return { user, ok:false, reason:'no inputs', url: page.url() };
  await inputs[0].type(user);
  await inputs[1].type(pass);
  await sleep(400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /登录|Login/i.test(x.innerText||''));
    if (b) b.click();
  });
  await sleep(6000);
  const u = page.url();
  const txt = await page.evaluate(() => document.body.innerText.replace(/\n+/g,' | ').slice(0,160));
  const loggedIn = !/login/i.test(u) && !/账号|密码/.test(txt);
  return { user, pass: pass.replace(/./g,'*'), ok: loggedIn, url:u, txt };
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1700,height:1000} });
  const page = await browser.newPage();
  for (const [u,p] of [['admin@sun.cc','12345678'],['admin@sun.cc','Fiery.813']]) {
    const r = await tryLogin(page, u, p);
    console.log(JSON.stringify(r));
  }
  await browser.close();
})();
