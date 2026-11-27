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

  // 弹层锁滚动时，滚动条会消失，页面会横跳一下；补上等宽的右内边距就不跳了
  function lockScroll() {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.documentElement.style.paddingRight = `${gap}px`;
    document.documentElement.classList.add("share-open");
  }

  function unlockScroll() {
    document.documentElement.classList.remove("share-open");
    document.documentElement.style.paddingRight = "";
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
      closeBtn!.focus();
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
