// 插图相关纯逻辑测试：二进制编码、文件名、Markdown 语法、上传请求体
// 跑法：node tests/image.mjs

import {
  b64encodeBytes,
  imageName,
  imageMarkdown,
  altFromFilename,
  IMAGES_DIR,
  IMAGE_URL_PREFIX,
  createGitHub,
} from '../app/core.js';

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

console.log('\n二进制 base64');
const jpegHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
eq('JPEG 文件头编码正确', b64encodeBytes(jpegHead), Buffer.from(jpegHead).toString('base64'));
eq('空数组', b64encodeBytes(new Uint8Array([])), '');
const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
eq('PNG 签名编码正确', b64encodeBytes(pngSignature), Buffer.from(pngSignature).toString('base64'));
ok('接受普通数组', b64encodeBytes([1, 2, 3]) === Buffer.from([1, 2, 3]).toString('base64'));

// 300KB 随机数据，验证分块不会爆栈，且结果逐字节一致
const big = new Uint8Array(300 * 1024);
for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
let bigOk = false;
try {
  bigOk = b64encodeBytes(big) === Buffer.from(big).toString('base64');
} catch (e) {
  bigOk = false;
  console.log('    ', e.message);
}
ok('300KB 图片分块编码不爆栈且结果一致', bigOk);

console.log('\n文件名');
const fixed = () => 0.5;
eq('基本格式', imageName('jpg', '2026-11-24', fixed), '20261124-888888.jpg');
eq('jpeg 归一化为 jpg', imageName('jpeg', '2026-11-24', fixed), '20261124-888888.jpg');
eq('大写扩展名', imageName('PNG', '2026-11-24', fixed), '20261124-888888.png');
eq('带点的扩展名', imageName('.webp', '2026-11-24', fixed), '20261124-888888.webp');
eq('没有扩展名兜底 jpg', imageName('', '2026-11-24', fixed), '20261124-888888.jpg');
eq('陌生扩展名兜底 jpg', imageName('exe', '2026-11-24', fixed), '20261124-888888.jpg');
eq('svg 也不收', imageName('svg', '2026-11-24', fixed), '20261124-888888.jpg');
eq('日期带斜杠也能清理', imageName('png', '2026/11/24', fixed), '20261124-888888.png');
ok('rand 返回 1 不越界', /^[0-9a-f]{6}$/.test(imageName('png', '2026-11-24', () => 1).slice(9, 15)));
ok(
  '连续 20 次都是合法格式',
  Array.from({ length: 20 }, () => imageName('jpg')).every((n) => /^[0-9]{8}-[0-9a-f]{6}\.jpg$/.test(n))
);

console.log('\nMarkdown 语法');
eq('基本', imageMarkdown('/images/a.jpg', '照片'), '![照片](/images/a.jpg)');
eq('alt 去掉方括号', imageMarkdown('/images/a.jpg', '我的[图]片'), '![我的图片](/images/a.jpg)');
eq('alt 折叠空白', imageMarkdown('/images/a.jpg', '  多   空格  '), '![多 空格](/images/a.jpg)');
eq('无 alt', imageMarkdown('/images/a.jpg'), '![](/images/a.jpg)');
eq('URL 空格编码', imageMarkdown('/images/my pic.jpg'), '![](/images/my%20pic.jpg)');
eq('URL 括号编码', imageMarkdown('/images/a(1).jpg'), '![](/images/a%281%29.jpg)');
eq('alt 超长截断', imageMarkdown('/x.jpg', 'a'.repeat(200)).length < 200, true);
let threw = false;
try {
  imageMarkdown('');
} catch {
  threw = true;
}
ok('空地址抛错', threw);

console.log('\nalt 推断');
eq('去扩展名并转空格', altFromFilename('IMG_2043.png'), 'IMG 2043');
eq('中文文件名保留', altFromFilename('樱花-约定.jpg'), '樱花 约定');
eq('无扩展名', altFromFilename('screenshot'), 'screenshot');
eq('空值', altFromFilename(''), '');
eq('截断到 60', altFromFilename('x'.repeat(100)).length, 60);

console.log('\n常量');
eq('图片目录', IMAGES_DIR, 'public/images');
eq('URL 前缀', IMAGE_URL_PREFIX, '/images');

console.log('\nputBinary 请求体');
const calls = [];
const gh = createGitHub({
  owner: 'me',
  repo: 'blog',
  branch: 'main',
  token: 'tok',
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, text: async () => JSON.stringify({ content: { sha: 'abc' }, commit: { sha: 'def', html_url: 'u' } }) };
  },
});
const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
const res = await gh.putBinary('public/images/x.jpg', bytes, '上传图片 x.jpg');
eq('请求方法', calls[0].init.method, 'PUT');
eq('请求地址', calls[0].url, 'https://api.github.com/repos/me/blog/contents/public/images/x.jpg');
const body = JSON.parse(calls[0].init.body);
eq('提交信息', body.message, '上传图片 x.jpg');
eq('分支', body.branch, 'main');
eq('内容为二进制 base64', body.content, Buffer.from(bytes).toString('base64'));
ok('新建文件不带 sha', body.sha === undefined);
eq('返回 sha', res.sha, 'abc');
eq('返回 commit', res.commit, 'def');

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
