const { launch, clickText } = require('./helper');
const PUB = 'https://daye-nav.app.workbuddy.host';
const SHARE = PUB + '/?sharecode=TBMY3RYXH3';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch();
  page.on('dialog', async d => { await d.accept(); });

  // 先带分享码进一次，拿到网关 cookie
  await page.goto(SHARE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  console.log('首页标题:', await page.title());

  await page.goto(PUB + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const inputs = await page.$$('input');
  await inputs[0].type('admin@sun.cc');
  await inputs[1].type('Fiery.813');
  await page.keyboard.press('Enter');
  await sleep(3500);
  console.log('登录后 URL:', page.url().replace(PUB, ''));

  await page.mouse.click(1397, 43);
  await sleep(1300);
  const ok = await clickText(page, '授权管理');
  console.log('点到授权管理:', ok);
  await sleep(3000);

  let cloud = '';
  for (let i = 0; i < 20; i++) {
    cloud = await page.evaluate(() => (document.querySelector('#la-cloud-txt') || {}).textContent || '');
    if (cloud && !/检测中/.test(cloud)) break;
    await sleep(400);
  }
  const info = await page.evaluate(() => {
    const el = document.querySelector('.la-wrap');
    if (!el) return { mounted: false };
    return {
      mounted: true,
      state: el.querySelector('#la-state')?.textContent,
      expire: el.querySelector('#la-expire')?.textContent,
      code: el.querySelector('#la-code')?.textContent,
      cloud: el.querySelector('#la-cloud-txt')?.textContent,
      cloudClass: el.querySelector('#la-cloud')?.className,
      cloudLink: el.querySelector('#la-cloud-link')?.getAttribute('href'),
      linkText: el.querySelector('#la-cloud-link')?.textContent,
      scroll: [el.scrollHeight, Math.round(el.getBoundingClientRect().height)],
    };
  });
  console.log('CLOUD:', cloud);
  console.log('PANEL:', JSON.stringify(info, null, 1));
  await page.screenshot({ path: 'shot-pub-auth-cloud.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
