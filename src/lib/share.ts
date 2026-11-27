import { createShareCard, toPngBlob, cardFileName } from "./share-card";
import type { ShareCardData } from "./share-card";


export function setupShare() {
  const btn = document.getElementById("share-btn");
  const menu = document.getElementById("share-menu");
  const tip = document.getElementById("share-tip");
  const dataEl = document.getElementById("share-card-data");
  const modal = document.getElementById("share-card-modal");
  if (!btn || !menu || !tip || !modal) return;

  const itemCopy = menu.querySelector<HTMLButtonElement>('[data-share="copy"]');
  const itemNative = menu.querySelector<HTMLButtonElement>('[data-share="native"]');
  const itemCard = menu.querySelector<HTMLButtonElement>('[data-share="card"]');
  const img = document.getElementById("share-card-img") as HTMLImageElement | null;
  const save = document.getElementById("share-card-save") as HTMLAnchorElement | null;
  const shareBtn = document.getElementById("share-card-share") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("share-card-close");
  const hint = document.getElementById("share-card-hint");
  if (!itemCopy || !itemCard || !img || !save || !closeBtn) return;

  const url = window.location.href;
  const title = document.title;
  // 桌面 Chrome 也有 navigator.share，但弹的是 Windows 系统面板，反而绕；
  // 只有真的触屏设备（有触点 + 粗指针）才给它一个入口
  const isTouch =
    navigator.maxTouchPoints > 0 &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  if (itemNative && typeof navigator.share === "function" && isTouch) itemNative.hidden = false;

  /* ---- 菜单 ---- */

  function openMenu() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    (menu.querySelector<HTMLButtonElement>("button:not([hidden])") ?? btn).focus();
  }

  function closeMenu(restoreFocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (restoreFocus) btn.focus();
  }

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (!(event.target instanceof Node)) return;
    if (menu.contains(event.target) || btn.contains(event.target)) return;
    closeMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) closeMenu();
  });

  // 菜单内上下键切换，符合 role=menu 的预期
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not([hidden])"));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? current + 1 : current - 1;
    items[(next + items.length) % items.length].focus();
  });

  /* ---- 提示 ---- */

  let timer = 0;
  function flash(text: string) {
    tip.textContent = text;
    tip.style.opacity = "1";
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      tip.style.opacity = "0";
    }, 2200);
  }

  /* ---- 复制链接 ---- */

  // 优先用异步剪贴板 API。它可能「存在但被拒」：页面未聚焦、权限被策略拦、
  // 隐私模式下都会 reject，所以要 try 一次再降级到 execCommand。
  async function copyText(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        /* 落到下面的兜底 */
      }
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    if (!ok) throw new Error("copy failed");
  }

  itemCopy.addEventListener("click", async () => {
    closeMenu(false);
    try {
      await copyText(url);
      flash("链接已复制");
    } catch {
      flash("复制失败，请手动复制地址栏");
    }
  });

  /* ---- 系统分享 ---- */

  itemNative?.addEventListener("click", async () => {
    closeMenu(false);
    try {
      await navigator.share({ title, text: title, url });
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      try {
        await copyText(url);
        flash("系统分享没打开，链接已复制");
      } catch {
        flash("分享失败，请手动复制地址栏");
      }
    }
  });

  /* ---- 分享卡片 ---- */

  let data: ShareCardData;
  try {
    data = JSON.parse(dataEl?.textContent ?? "{}") as ShareCardData;
  } catch {
    return;
  }
  if (!data.title) {
    itemCard.hidden = true;
  }

  const fileName = data.title ? cardFileName(data.title) : "share.png";
  let objectUrl = "";
  let file: File | null = null;

  // 弹层锁滚动时有两件事会动页面：
  // 1) 滚动条消失，内容会横向补 15px —— 用等宽右内边距补掉
  // 2) html 上的 overflow:hidden 会让文档「不再可滚动」，有些浏览器顺手把
  //    滚动位置清零，加上后面 focus() 也会把焦点滚进视野 —— 所以先把
  //    scrollY 记下来，锁完立刻用 auto（不是 smooth）写回去
  let lockedY = 0;

  function lockScroll() {
    lockedY = window.scrollY;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.documentElement.style.paddingRight = `${gap}px`;
    document.documentElement.classList.add("share-open");
    document.body.style.position = "fixed";
    document.body.style.top = `${-lockedY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, lockedY);
    document.documentElement.style.scrollBehavior = prev;
  }

  function unlockScroll() {
    document.documentElement.classList.remove("share-open");
    document.documentElement.style.paddingRight = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, lockedY);
    document.documentElement.style.scrollBehavior = prev;
  }

  function closeCard() {
    modal!.hidden = true;
    unlockScroll();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }
    img!.removeAttribute("src");
  }

  itemCard.addEventListener("click", async () => {
    closeMenu(false);
    if (!data.title) return;
    itemCard.setAttribute("aria-busy", "true");
    try {
      const canvas = await createShareCard(data);
      const blob = await toPngBlob(canvas);
      file = new File([blob], fileName, { type: "image/png" });

      const canShareFile =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (shareBtn) shareBtn.hidden = !canShareFile;
      // 安卓 Chrome 认 download 属性，iOS Safari 不认，得提示长按保存
      if (hint) {
        hint.textContent = "手机上没有保存按钮时，可以长按上面的图片存进相册。";
        hint.hidden = canShareFile || !("download" in HTMLAnchorElement.prototype);
      }

      objectUrl = URL.createObjectURL(blob);
      save.href = objectUrl;
      save.download = fileName;
      // 弹层在 hidden 状态，lazy 的图永远不会开始加载、decode() 就永远挂起；
      // 临时改成 eager 触发加载（HTML 上那个 loading 属性留给页面测试检查）
      img.loading = "eager";
      img.src = objectUrl;
      // 等图片解码完再显示，否则弹层会先出现一个空框再蹦出图，很跳
      await Promise.race([
        img.decode().catch(() => {}),
        new Promise((done) => window.setTimeout(done, 1200)),
      ]);
      lockScroll();
      modal.hidden = false;
      closeBtn!.focus({ preventScroll: true });
    } catch {
      flash("这张卡片没能生成，换用「复制链接」也可以");
    } finally {
      itemCard.removeAttribute("aria-busy");
    }
  });

  shareBtn?.addEventListener("click", async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: data.title, text: data.summary });
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError" && hint) {
        hint.textContent = "系统分享没打开，直接保存图片也可以。";
        hint.hidden = false;
      }
    }
  });

  closeBtn.addEventListener("click", closeCard);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCard();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeCard();
  });

  btn.hidden = false;
}
