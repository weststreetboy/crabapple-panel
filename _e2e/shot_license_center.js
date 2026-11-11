const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.LC || 'http://127.0.0.1:8787';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'], defaultViewport:{width:1280,height:900} });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });
  page.on('response', async r => {
    const u = r.url();
    if (u.includes('/api/')) {
      let t = ''; try { t = (await r.text()).slice(0, 120); } catch (e) {}
      console.log('NET', r.status(), u.replace(BASE, ''), t);
    }
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 40000 });
  await sleep(800);
  await page.evaluate(() => {
    window.__ls = JSON.stringify(Object.keys(localStorage));
    document.getElementById('pwd').value = 'Fiery.813';
    document.getElementById('loginBtn').click();
  });
  await sleep(2000);
  console.log('localStorage keys', await page.evaluate(() => window.__ls));
  const st = await page.evaluate(() => ({
    loginHidden: document.getElementById('loginCard').hidden,
    panelHidden: document.getElementById('panel').hidden,
    items: document.querySelectorAll('.item').length,
    toast: document.getElementById('toast').textContent
  }));
  console.log('STATE', JSON.stringify(st));
  await page.screenshot({ path: 'lc-panel-login.png' });

  // 签发一条 3 年
  await page.evaluate(() => {
    document.getElementById('lname').value = '家里 NAS 面板';
    document.getElementById('ldur').value = '1095';
    document.getElementById('issueBtn').click();
  });
  await sleep(1600);
  await page.evaluate(() => {
    document.getElementById('lname').value = '备用机 · 永久';
    document.getElementById('ldur').value = '0';
    document.getElementById('issueBtn').click();
  });
  await sleep(1600);
  const stat = await page.evaluate(() => ({
    total: document.getElementById('sTotal').textContent,
    active: document.getElementById('sActive').textContent,
    items: document.querySelectorAll('.item').length,
    codes: [...document.querySelectorAll('.code')].map(e => e.textContent.trim()),
  }));
  console.log('UI', JSON.stringify(stat, null, 1));
  await page.screenshot({ path: 'lc-panel.png' });
  await page.setViewport({ width: 400, height: 880 });
  await sleep(700);
  await page.screenshot({ path: 'lc-mobile.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
