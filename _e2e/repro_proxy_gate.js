const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8788';
const ID = process.argv[2];
const U = process.argv[3];
const P = process.argv[4];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  const logs = [];
  const reqs = [];
  page.on('pageerror', e => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') logs.push('CONSOLE ' + m.text().slice(0, 200)); });
  page.on('requestfailed', r => reqs.push('FAIL ' + r.failure().errorText + ' ' + r.url().slice(0, 160)));
  page.on('response', r => { const u = r.url(); if (u.includes('/s/')) reqs.push(r.status() + ' ' + u.slice(0, 160)); });

  await page.goto(BASE + '/s/' + ID, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1200);
  const inputs = await page.$$('input');
  console.log('gate inputs:', inputs.length, 'title:', await page.title());
  if (inputs.length >= 2) {
    await inputs[0].type(U);
    await inputs[1].type(P);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
      page.click('button[type=submit]'),
    ]);
    console.log('after gate url:', page.url());
  }
  await sleep(12000);
  const state = await page.evaluate(() => ({
    title: document.title,
    bodyLen: document.body ? document.body.innerText.trim().length : -1,
    snippet: document.body ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) : '',
    htmlSnippet: document.documentElement.outerHTML.slice(0, 300),
    scripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).slice(0, 10),
    links: [...document.querySelectorAll('link[href]')].map(s => s.getAttribute('href')).slice(0, 10),
  }));
  await page.screenshot({ path: path.join(__dirname, 'repro-proxy.png') });
  console.log('STATE', JSON.stringify(state, null, 1));
  console.log('LOGS', JSON.stringify(logs.slice(0, 15), null, 1));
  console.log('REQS', JSON.stringify(reqs.slice(0, 40), null, 1));
  await browser.close();
})();
