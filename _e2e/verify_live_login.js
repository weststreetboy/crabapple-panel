const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await p.goto('https://auth.xuers.dpdns.org/', { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: 'live-login-new.png' });
  const info = await p.evaluate(() => ({
    title: document.title,
    bg: getComputedStyle(document.querySelector('.login-left')).backgroundColor,
    chars: document.querySelectorAll('.scene .ch').length,
    hasGrid: !!document.querySelector('.login-left .grid'),
    formW: Math.round(document.querySelector('.form-box').getBoundingClientRect().width),
    btnH: Math.round(document.querySelector('#loginBtn').getBoundingClientRect().height)
  }));
  console.log('view:', JSON.stringify(info));
  await p.type('#username', 'admin');
  await p.type('#password', 'Fiery.813');
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: 'live-login-typing.png' });
  await p.click('#togglePwd');
  await new Promise(r => setTimeout(r, 1000));
  await p.screenshot({ path: 'live-login-peek.png' });
  await p.click('#togglePwd');
  await p.click('#loginBtn');
  await new Promise(r => setTimeout(r, 2500));
  const state = await p.evaluate(() => ({
    loginHidden: document.getElementById('loginView').hidden,
    appHidden: document.getElementById('appView').hidden,
    err: document.getElementById('loginErr').hidden ? '' : document.getElementById('loginErr').textContent,
    licCount: document.getElementById('sTotal') && document.getElementById('sTotal').textContent,
    sideLogoHtml: document.getElementById('sideLogo').innerHTML.slice(0, 40)
  }));
  console.log('afterLogin:', JSON.stringify(state), 'errors:', JSON.stringify(errs.slice(0,3)));
  await p.screenshot({ path: 'live-app-new.png' });
  await b.close();
})();
