/* 授权中心 v4 本地验证（dev.js 内存 KV，重启即清空）：
   本轮需求：设置入口移入用户区 + 账户可上传头像
   1) 登录 / 会话返回 avatar 字段（初始为空）
   2) POST /api/settings/avatar 保存 dataURL，会话与再次登录都能带出
   3) 非法协议、超长数据被拒；未登录被 401；拒绝后不污染已存头像
   4) 导出 JSON 头像只留占位说明，不塞 base64
   5) 清除头像后回退为空
   6) 回归：签发 / 未使用不能注销 / markUsed 后可注销（确认没碰坏原功能）
   7) 页面：app.js?v=5、nav 只剩一个菜单项且无「设置」、whoEntry + 头像行都在
*/
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const PWD = process.env.LC_ADMIN_PWD || 'Fiery.813';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+7V1zAAAAAElFTkSuQmCC';

async function req(path, opt) {
  opt = opt || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opt.token) headers.Authorization = 'Bearer ' + opt.token;
  const r = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers,
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

(async () => {
  const R = {};

  let health = null;
  for (let i = 0; i < 30; i++) {
    try { const h = await req('/api/health'); if (h && h.ok === true) { health = h; break; } } catch (e) { /* 未就绪 */ }
    await sleep(400);
  }
  if (!health) throw new Error('dev 服务未就绪');

  // ---- 登录 ----
  const login = await req('/api/login', { method: 'POST', body: { username: 'admin', password: PWD } });
  if (!login.ok) throw new Error('登录失败: ' + JSON.stringify(login));
  const token = login.data.token;
  if (!token) throw new Error('登录未返回 token');
  const A = { token };
  R.loginAvatar = login.data.account.avatar;

  const ses0 = await req('/api/session', A);
  R.sessionAvatarEmpty = ses0.data.account.avatar === '';

  // ---- 保存头像 ----
  const set1 = await req('/api/settings/avatar', { method: 'POST', token, body: { avatar: PNG } });
  R.saveAvatar = { ok: !!set1.ok, echo: !!set1.ok && set1.data.avatar === PNG };

  const ses1 = await req('/api/session', A);
  R.sessionAvatarPersisted = ses1.data.account.avatar === PNG;

  const login2 = await req('/api/login', { method: 'POST', body: { username: 'admin', password: PWD } });
  R.reloginAvatar = !!login2.ok && login2.data.account.avatar === PNG;

  // ---- 导出 JSON 不含 base64 ----
  const exp = await req('/api/export?format=json', A);
  R.exportAvatar = exp && exp.account ? exp.account.avatar : null;
  R.exportNoBase64 = JSON.stringify(exp).indexOf('iVBORw0KGgo') === -1;

  // ---- 非法输入 / 越权 ----
  const bad1 = await req('/api/settings/avatar', { method: 'POST', token, body: { avatar: 'javascript:alert(1)' } });
  const bad2 = await req('/api/settings/avatar', { method: 'POST', token, body: { avatar: 'x'.repeat(400001) } });
  const noauth = await req('/api/settings/avatar', { method: 'POST', body: { avatar: PNG } });
  R.rejectBadProtocol = bad1.ok === false;
  R.rejectTooLarge = bad2.ok === false;
  R.rejectNoAuth = noauth.ok === false;

  const ses2 = await req('/api/session', A);
  R.avatarStillPngAfterBad = ses2.data.account.avatar === PNG;

  // ---- 清除头像 ----
  const clr = await req('/api/settings/avatar', { method: 'POST', token, body: { avatar: '' } });
  R.clearAvatar = { ok: !!clr.ok, empty: !!clr.ok && clr.data.avatar === '' };
  const ses3 = await req('/api/session', A);
  R.sessionCleared = ses3.data.account.avatar === '';

  // ---- 授权功能回归 ----
  const iss = await req('/api/licenses', { method: 'POST', token, body: { name: 'v4回归', days: 7 } });
  const id = iss.data && iss.data.id;
  const rb = await req('/api/licenses/revoke', { method: 'POST', token, body: { id } });
  const mk = await req('/api/licenses/markUsed', { method: 'POST', token, body: { id, used: true } });
  const ra = await req('/api/licenses/revoke', { method: 'POST', token, body: { id } });
  R.regression = {
    issue: !!iss.ok,
    revokeBeforeUsed: rb.ok === false,
    markUsed: !!mk.ok,
    revokeAfterUsed: !!ra.ok && ra.data.status === 'revoked',
  };

  // ---- 页面结构 ----
  const html = await req('/');
  const navMatch = /<nav class="nav">([\s\S]*?)<\/nav>/.exec(html);
  const navHtml = navMatch ? navMatch[1] : '';
  R.page = {
    v5: html.indexOf('/app.js?v=5') !== -1,
    navItems: (navHtml.match(/class="nav-item/g) || []).length,
    navHasSet: navHtml.indexOf('data-view="set"') !== -1,
    whoEntry: html.indexOf('id="whoEntry"') !== -1 && html.indexOf('data-view="set"') !== -1,
    avatarRow: html.indexOf('id="avatarPreview"') !== -1 && html.indexOf('id="avatarFile"') !== -1,
  };

  const checks = {
    loginAvatarEmpty: R.loginAvatar === '',
    sessionAvatarEmpty: R.sessionAvatarEmpty,
    saveAvatar: R.saveAvatar.ok && R.saveAvatar.echo,
    persisted: R.sessionAvatarPersisted,
    relogin: R.reloginAvatar,
    exportPlaceholder: R.exportAvatar === '(图片数据已省略)',
    exportNoBase64: R.exportNoBase64,
    rejectBadProtocol: R.rejectBadProtocol,
    rejectTooLarge: R.rejectTooLarge,
    rejectNoAuth: R.rejectNoAuth,
    noPollution: R.avatarStillPngAfterBad,
    cleared: R.clearAvatar.ok && R.clearAvatar.empty && R.sessionCleared,
    regression: Object.values(R.regression).every(Boolean),
    pageV5: R.page.v5,
    navSingleItem: R.page.navItems === 1,
    navNoSet: R.page.navHasSet === false,
    whoEntry: R.page.whoEntry,
    avatarRow: R.page.avatarRow,
  };
  R.checks = checks;
  R.allPass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify(R, null, 1));
  if (!R.allPass) process.exit(1);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
