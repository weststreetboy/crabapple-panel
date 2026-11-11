const puppeteer = require('puppeteer-core');
const LIVE = 'https://daye-nav.app.workbuddy.host/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    const out = {};
    page.on('console', m => { /* ignore */ });
    await page.goto(LIVE, { waitUntil: 'networkidle2', timeout: 60000 });

    // same-origin fetch of the custom assets the gateway 403-blocks for curl
    out.features = await page.evaluate(async () => {
      const r = await fetch('/custom/features.js', { cache: 'no-store' });
      const t = await r.text();
      return {
        status: r.status,
        len: t.length,
        hasRainCard: t.includes('数据恢复（服务器已有备份）') && t.includes('data-sp-restore-card'),
        hasHoverCard: t.includes('鼠标悬停效果') && t.includes('data-sp-rain-card'),
        hasGearPopup: t.includes('打开万能窗口'),
        hasRainMode: t.includes('sp_rain_mode')
      };
    });
    out.css = await page.evaluate(async () => {
      const r = await fetch('/custom/features.css', { cache: 'no-store' });
      const t = await r.text();
      return {
        status: r.status,
        len: t.length,
        themeAware: t.includes('html.dark') && t.includes('sp-restore-card') === false ? 'n/a' : t.includes('html.dark'),
        hasRestoreCard: t.includes('.sp-restore-card') || t.includes('.sp-ri-name'),
        hasGearDockCss: t.includes('sp-uni-mask') || t.includes('sp-feat-pop')
      };
    });

    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await browser.close();
  }
})();
