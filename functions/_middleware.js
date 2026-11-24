// 写作台访问控制：只给 /app/ 加一道密码门，博客本身保持公开。
//
// 为什么用 Basic Auth 而不是 Cloudflare Access：
// Access 保护的是整个主机名，博客会被一起挡住；而且要绑定自有域名才好用。
// 这里只需要挡住一个路径前缀，Pages Functions 中间件最直接。
//
// 密码放在 Cloudflare Pages 的环境变量 APP_PASS 里，不进仓库。
// 未配置密码时一律拒绝（fail closed），绝不因为漏配而放行。

/** 需要保护的前缀。后两个是 build 时兜底复制到站点根的写作台资源。 */
const PROTECTED = ['/app', '/app.css', '/core.js'];

/**
 * 判断一个路径是否属于写作台。
 * 用精确匹配或「前缀 + 斜杠」，避免把 /app-store 这类无关路径误挡。
 */
export function isWriterPath(pathname) {
  const p = String(pathname || '');
  return PROTECTED.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

/**
 * 恒定时间字符串比较。
 * 长度不同时仍走完整个循环，避免用耗时差异逐位猜密码。
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * 校验 Authorization 头。
 * 返回 true 表示凭据正确；缺头、格式错、解码失败、账号密码不符都返回 false。
 */
export function checkBasicAuth(header, user, pass) {
  if (typeof header !== 'string' || header.length < 7) return false;
  if (header.slice(0, 6).toLowerCase() !== 'basic ') return false;

  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }

  const sep = decoded.indexOf(':');
  if (sep < 0) return false;

  const gotUser = decoded.slice(0, sep);
  const gotPass = decoded.slice(sep + 1);
  // 两项都要比完再返回，不要用 && 短路泄露「用户名对不对」。
  const userOk = safeEqual(gotUser, user);
  const passOk = safeEqual(gotPass, pass);
  return userOk && passOk;
}

function plain(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  // 博客、文章、标签、搜索、RSS 全部原样放行，中间件只多判断一次字符串。
  if (!isWriterPath(pathname)) return next();

  const user = (env && env.APP_USER) || 'datasickle';
  const pass = (env && env.APP_PASS) || '';

  if (!pass) {
    return plain(
      '写作台尚未设置访问密码。\n\n请在 Cloudflare Pages 项目 → Settings → Environment variables 添加 APP_PASS，然后重新部署一次。',
      503
    );
  }

  if (checkBasicAuth(request.headers.get('Authorization'), user, pass)) {
    return next();
  }

  return plain('需要登录才能打开写作台。', 401, {
    'WWW-Authenticate': 'Basic realm="Inkwell", charset="UTF-8"',
  });
}
