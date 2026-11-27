import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { execSync } from "node:child_process";

/**
 * 部署探针：把「这次构建用的是哪个提交」写进一个静态 JSON。
 *
 * 背景：Cloudflare Pages 构建失败会**保留旧版本**继续返回 200，看页面还在很容易
 * 以为上线了。有了这个端点，CI 可以等线上 commit 变成自己这次推送的 sha，
 * 变不过来就是红的，人会被通知到。
 *
 * 提交号优先级：CF_PAGES_COMMIT_SHA（Cloudflare 构建时注入）→ GITHUB_SHA（Actions）
 * → 本地 git rev-parse（本地构建）。
 */
function currentCommit(): string {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.trim();
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).length;
  const notes = (await getCollection("notes", ({ data }) => !data.draft)).length;

  const body = {
    commit: currentCommit(),
    builtAt: new Date().toISOString(),
    posts,
    notes,
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
