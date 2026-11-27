// 部署探针：确认线上跑的是哪个提交。
//
// 用法：
//   node tools/check-deploy.mjs                    # 只打印线上现在是什么
//   node tools/check-deploy.mjs <sha>              # 等线上变成这个提交，最多等 120 秒
//   node tools/check-deploy.mjs <sha> --wait 600   # 自定义等待上限（秒）
//   ORIGIN=https://example.com node tools/check-deploy.mjs <sha>
//
// 退出码：0 = 线上已经是这个提交；1 = 等到超时还不是（或请求失败）。

const ORIGIN = process.env.ORIGIN || "https://datasickle-blog.pages.dev";

const argv = process.argv.slice(2);
const expected = (argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "").trim();
const waitIndex = argv.indexOf("--wait");
const waitSec = waitIndex >= 0 ? Number(argv[waitIndex + 1]) || 120 : expected ? 120 : 0;

const short = (sha) => (sha || "").slice(0, 7);

async function probe() {
  // 加随机参数：/version.json 设了 no-store，但中间代理仍可能缓存，破一下
  const res = await fetch(`${ORIGIN}/version.json?t=${Date.now()}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function main() {
  const deadline = Date.now() + waitSec * 1000;
  let lastReport = "";
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const stamp = new Date().toTimeString().slice(0, 8);
    try {
      const info = await probe();
      const live = String(info.commit || "");
      const same = !expected || live.startsWith(expected) || expected.startsWith(live);
      const age = info.builtAt ? Math.round((Date.now() - Date.parse(info.builtAt)) / 1000) : null;
      const report = `${stamp} 线上 ${short(live)}  期望 ${short(expected) || "(不比对)"}  ${info.posts} 篇 / ${info.notes} 条  构建于 ${age === null ? "?" : age + " 秒前"}`;
      if (report !== lastReport) {
        console.log(report);
        lastReport = report;
      }
      if (same) {
        console.log(`\n✓ 已部署：线上就是 ${short(live)}`);
        return 0;
      }
    } catch (error) {
      console.log(`${stamp} 第 ${attempt} 次失败：${error.message}`);
    }

    if (Date.now() >= deadline) {
      console.log(`\n✗ 等了 ${waitSec} 秒，线上仍不是 ${short(expected)}`);
      if (!expected) console.log("  （没有给期望提交，只做了探测）");
      return expected ? 1 : 0;
    }

    await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 10000));
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
