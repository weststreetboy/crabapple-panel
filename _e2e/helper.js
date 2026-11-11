const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3002';

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));
}

async function openLauncher(page) {
  await page.mouse.click(1397, 43);
  await new Promise(r => setTimeout(r, 1200));
}

async function clickText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === t);
    if (!els.length) return false;
    els[0].click();
    return true;
  }, text);
}

async function launch() {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) console.log('[console]', t.slice(0, 160)); });
  return { browser, page };
}

module.exports = { login, openLauncher, clickText, launch, BASE };
