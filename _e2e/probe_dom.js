const { login, openLauncher, clickText, launch } = require('./helper');

(async () => {
  const { browser, page } = await launch();
  await login(page);
  await openLauncher(page);
  await clickText(page, '授权管理');
  await new Promise(r => setTimeout(r, 2000));

  const out = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('*')].find(e => (e.innerText || '').trim() === '快速登录 Sun-Panel 账号');
    if (!btn) return 'not found';
    const lines = [];
    let el = btn, i = 0;
    while (el && i < 9) {
      const r = el.getBoundingClientRect();
      lines.push(`${i}: <${el.tagName.toLowerCase()} class="${(el.className || '').toString().slice(0, 90)}" id="${el.id}" ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}>`);
      el = el.parentElement; i++;
    }
    // 也打印最外层 modal 的结构
    const modal = btn.closest('.n-modal');
    if (modal) {
      lines.push('--- modal tree ---');
      const walk = (n, d) => {
        if (d > 7) return;
        for (const c of n.children) {
          const r = c.getBoundingClientRect();
          lines.push('  '.repeat(d) + `<${c.tagName.toLowerCase()} class="${(c.className || '').toString().slice(0, 80)}"> ${Math.round(r.width)}x${Math.round(r.height)}`);
          walk(c, d + 1);
        }
      };
      walk(modal, 0);
    }
    return lines.join('\n');
  });
  console.log(out);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
