// 写作台访问控制测试：路径判定、Basic Auth 解析、中间件放行/拦截
// 跑法：node tests/auth.mjs

import {
  isWriterPath,
  safeEqual,
  checkBasicAuth,
  onRequest,
} from '../functions/_middleware.js';

let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, `实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
}

const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`, 'latin1').toString('base64')}`;

console.log('\n路径判定');
for (const p of ['/app', '/app/', '/app/index.html', '/app/app.css', '/app/core.js', '/app.css', '/core.js']) {
  ok(`保护 ${p}`, isWriterPath(p) === true);
}
for (const p of ['/', '/tags/', '/archive/', '/search/', '/rss.xml', '/20261123-kai-zhang/', '/app-store', '/application/', '/core.json', '']) {
  ok(`放行 ${p || '(空)'}`, isWriterPath(p) === false);
}

console.log('\n恒定时间比较');
ok('相同为 true', safeEqual('secret', 'secret') === true);
ok('不同为 false', safeEqual('secret', 'secreT') === false);
ok('长度不同为 false', safeEqual('secret', 'secret1') === false);
ok('空对空为 true', safeEqual('', '') === true);
ok('非字符串为 false', safeEqual(null, 'x') === false);

console.log('\nAuthorization 解析');
ok('正确凭据', checkBasicAuth(basic('datasickle', 'p@ss'), 'datasickle', 'p@ss') === true);
ok('用户名错', checkBasicAuth(basic('other', 'p@ss'), 'datasickle', 'p@ss') === false);
ok('密码错', checkBasicAuth(basic('datasickle', 'nope'), 'datasickle', 'p@ss') === false);
ok('大小写前缀也认', checkBasicAuth('basic ' + Buffer.from('a:b').toString('base64'), 'a', 'b') === true);
ok('缺头', checkBasicAuth(undefined, 'a', 'b') === false);
ok('空头', checkBasicAuth('', 'a', 'b') === false);
ok('非 Basic 方案', checkBasicAuth('Bearer abc', 'a', 'b') === false);
ok('非法 base64', checkBasicAuth('Basic !!!not-base64!!!', 'a', 'b') === false);
ok('缺少冒号', checkBasicAuth('Basic ' + Buffer.from('nocolon').toString('base64'), 'a', 'b') === false);
ok(
  '密码含冒号按首个冒号切分',
  checkBasicAuth('Basic ' + Buffer.from('user:a:b:c').toString('base64'), 'user', 'a:b:c') === true
);

console.log('\n中间件行为');

let nextCalls = 0;
const next = async () => {
  nextCalls += 1;
  return new Response('page', { status: 200 });
};

const env = { APP_USER: 'datasickle', APP_PASS: 'only-me' };

async function call(path, headers = {}, e = env) {
  nextCalls = 0;
  const req = new Request(`https://datasickle-blog.pages.dev${path}`, { headers });
  const res = await onRequest({ request: req, env: e, next });
  return { res, nextCalls };
}

const plainVisit = await call('/');
eq('博客首页状态 200', plainVisit.res.status, 200);
eq('博客首页走静态资源', plainVisit.nextCalls, 1);

const tagsVisit = await call('/tags/');
eq('标签页不受影响', tagsVisit.res.status, 200);
eq('标签页未触发鉴权', tagsVisit.nextCalls, 1);

const noAuth = await call('/app/');
eq('写作台无凭据返回 401', noAuth.res.status, 401);
eq('写作台无凭据不落到静态资源', noAuth.nextCalls, 0);
ok('带 WWW-Authenticate 触发浏览器弹窗', /^Basic realm=/.test(noAuth.res.headers.get('WWW-Authenticate') || ''));
eq('401 不缓存', noAuth.res.headers.get('cache-control'), 'no-store');

const wrongAuth = await call('/app/', { Authorization: basic('datasickle', 'guess') });
eq('密码错误返回 401', wrongAuth.res.status, 401);
eq('密码错误不进页面', wrongAuth.nextCalls, 0);

const goodAuth = await call('/app/', { Authorization: basic('datasickle', 'only-me') });
eq('凭据正确放行', goodAuth.res.status, 200);
eq('凭据正确落到静态资源', goodAuth.nextCalls, 1);

const goodAsset = await call('/app/app.css?v=abc123', { Authorization: basic('datasickle', 'only-me') });
eq('带版本号的静态资源同样放行', goodAsset.nextCalls, 1);

const rootAssetNoAuth = await call('/core.js');
eq('兜底脚本无凭据被挡', rootAssetNoAuth.res.status, 401);

const noSlash = await call('/app');
eq('/app 不带斜杠也被挡', noSlash.res.status, 401);

const tailSlash = await call('/app/core.js');
eq('/app 子路径被挡', tailSlash.res.status, 401);

const decoy = await call('/app-store/');
eq('形近路径不被误挡', decoy.nextCalls, 1);

const noPass = await call('/app/', {}, { APP_USER: 'datasickle' });
eq('未配密码拒绝访问（503）', noPass.res.status, 503);
eq('未配密码不放行', noPass.nextCalls, 0);

const body503 = await noPass.res.text();
ok('503 提示说明怎么配', body503.includes('APP_PASS'), body503.slice(0, 40));

const customUser = await call('/app/', { Authorization: basic('boss', 'only-me') }, { APP_USER: 'boss', APP_PASS: 'only-me' });
eq('自定义用户名生效', customUser.nextCalls, 1);

const defaultUser = await call('/app/', { Authorization: basic('datasickle', 'only-me') }, { APP_PASS: 'only-me' });
eq('未设 APP_USER 时默认 datasickle', defaultUser.nextCalls, 1);

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
