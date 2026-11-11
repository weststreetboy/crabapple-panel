const puppeteer = require('puppeteer-core');
const crypto = require('crypto');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const B = 'http://127.0.0.1:8787';
const DL = 'C://Users//Administrator//AppData//Local//Temp//lc_dl';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function totp(secret) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0; const out = [];
  for (const ch of secret.replace(/=+$/, '')) {
    const i = B32.indexOf(ch.toUpperCase()); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(Date.now() / 30000 / 4294967296), 0);
  buf.writeUInt32BE(Math.floor(Date.now() / 30000) >>> 0, 4);
  const mac = crypto.createHmac('sha1', Buffer.from(out)).update(buf).digest();
  const o = mac[19] & 0x0f;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 180)));
  await page.goto(B + '/', { waitUntil: 'networkidle2' });
  await page.type('#username', 'admin'); await page.type('#password', 'Fiery.813');
  await page.click('#loginBtn'); await sleep(1800);

  await page._client().send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await page.evaluate(() => document.querySelector('.nav-item[data-view="set"]').click());
  await sleep(300);
  await page.click('#expCsv'); await sleep(1200);
  await page.click('#expJson'); await sleep(1200);

  // 直接调 API 开启 2FA
  const secret = await page.evaluate(async () => {
    const tk = (JSON.parse(sessionStorage.getItem('lc_auth') || localStorage.getItem('lc_auth'))).t;
    const r = await fetch('/api/settings/2fa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: '{}' });
    return (await r.json()).data.secret;
  });
  const code = totp(secret);
  const enabled = await page.evaluate(async (c) => {
    const tk = (JSON.parse(sessionStorage.getItem('lc_auth') || localStorage.getItem('lc_auth'))).t;
    const r = await fetch('/api/settings/2fa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ code: c }) });
    return (await r.json());
  }, code);
  console.log('2FA 开启:', JSON.stringify(enabled));

  // 清 token 重新登录，走 totp 步骤
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(B + '/', { waitUntil: 'networkidle2' });
  await sleep(600);
  await page.type('#username', 'admin'); await page.type('#password', 'Fiery.813');
  await page.click('#loginBtn'); await sleep(1800);
  const needTotp = await page.evaluate(() => !document.getElementById('totpForm').hidden);
  console.log('出现双重验证步骤:', needTotp);
  await page.screenshot({ path: 'lc5-totp-step.png' });
  await page.type('#totpCode', totp(secret));
  await page.click('#totpBtn'); await sleep(2000);
  console.log('登录成功进入 App:', await page.evaluate(() => !document.getElementById('appView').hidden));

  console.log('ERR:', errs.length ? errs.join('\n') : '无');
  await browser.close();
})();
