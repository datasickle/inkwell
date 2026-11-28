// 正文图片放大：文章页和碎片页共用。
//
// 之前这段代码只写在文章页的脚本里，碎片页没有 —— 于是「点图片没反应」。
// 更迷惑的是「有时候又能打开」：ClientRouter 换页只替换 <body>，
// 同一个 JS 模块不会重复执行，但文档级监听器还活着，
// 所以从文章页跳过去的碎片还能点开，直接打开碎片页就点不动。
//
// 现在全局只绑一次（文档级委托，点击时再找当前 <article>），
// setupLightbox() 可以被任何页面反复调用，重复调用无副作用。

type Item = { src: string; alt: string };

let bound = false;
let overlay: HTMLDivElement | null = null;
let frame: HTMLImageElement | null = null;
let counter: HTMLSpanElement | null = null;
let items: Item[] = [];
let index = 0;
let scrollY = 0;

let scale = 1;
let tx = 0;
let ty = 0;
let dragging = false;
let moved = false;
let startX = 0;
let startY = 0;
let baseX = 0;
let baseY = 0;
let touchX = 0;
let touchY = 0;

const MAX_SCALE = 4;

function collect(): Item[] {
  const article = document.querySelector("article");
  if (!article) return [];
  const list: Item[] = [];
  article.querySelectorAll("img").forEach((node) => {
    const img = node as HTMLImageElement;
    // 优化过的图带 width 属性，懒加载还没落地时也能判大小；
    // 表情、图标这类小图放大没意义，直接跳过
    const declared = Number(img.getAttribute("width") ?? 0);
    if (declared >= 200 || img.naturalWidth >= 200) {
      list.push({ src: img.currentSrc || img.src, alt: img.alt });
    }
  });
  return list;
}

function paint() {
  if (!frame) return;
  frame.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  frame.style.cursor = scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in";
  overlay?.classList.toggle("zoomed", scale > 1);
}

function reset() {
  scale = 1;
  tx = 0;
  ty = 0;
  paint();
}

function show(next: number) {
  if (!items.length) return;
  index = (next + items.length) % items.length;
  if (frame) {
    frame.src = items[index].src;
    frame.alt = items[index].alt;
  }
  reset();
  if (counter) {
    counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "";
    counter.hidden = items.length < 2;
  }
}

function close() {
  if (!overlay) return;
  const root = document.documentElement;
  overlay.classList.remove("on");
  // body 一解除 fixed，文档就回到顶部；而全局是 scroll-behavior: smooth，
  // 直接 scrollTo 会变成一段「从顶部滑下来」的动画，看着像页面重新加载了一遍。
  // 这一步必须瞬时复位，所以先把 smooth 临时关掉，下一帧再还原。
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  root.classList.remove("lightbox-open");
  document.body.style.top = "";
  window.scrollTo(0, scrollY);
  requestAnimationFrame(() => {
    root.style.scrollBehavior = prevBehavior;
  });
  const dying = overlay;
  overlay = null;
  frame = null;
  counter = null;
  window.setTimeout(() => dying.remove(), 220);
}

function openAt(list: Item[], start: number) {
  if (overlay || !list.length) return;
  items = list;
  scrollY = window.scrollY;

  overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", items[start]?.alt || "图片预览");

  frame = document.createElement("img");
  frame.alt = "";
  frame.draggable = false;
  overlay.appendChild(frame);

  counter = document.createElement("span");
  counter.className = "lightbox-count";
  overlay.appendChild(counter);

  document.body.appendChild(overlay);
  show(start);
  // 下一帧再加 .on，否则不会触发过渡
  requestAnimationFrame(() => overlay?.classList.add("on"));

  // 锁滚动：fixed + 负 top 保持视觉位置不跳
  document.documentElement.classList.add("lightbox-open");
  document.body.style.top = `-${scrollY}px`;

  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // 点背景关闭；没放大时点图片本身也关闭（沿用原来的手感）
    if (target === overlay) close();
    else if (target === frame && scale === 1 && !moved) close();
    moved = false;
  });

  // 滚轮缩放，1x 到 4x
  overlay.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const next = Math.min(
        MAX_SCALE,
        Math.max(1, Math.round(scale * (event.deltaY < 0 ? 1.15 : 0.87) * 1000) / 1000)
      );
      if (next === scale) return;
      scale = next;
      if (scale === 1) {
        tx = 0;
        ty = 0;
      }
      paint();
    },
    { passive: false }
  );

  // 放大之后按住拖动
  overlay.addEventListener("pointerdown", (event) => {
    if (scale === 1 || !frame) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    baseX = tx;
    baseY = ty;
    frame.setPointerCapture?.(event.pointerId);
    paint();
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    tx = baseX + dx;
    ty = baseY + dy;
    paint();
  });

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    paint();
  };
  overlay.addEventListener("pointerup", stopDrag);
  overlay.addEventListener("pointercancel", stopDrag);

  // 手机上左右滑翻页（只在未放大时）
  overlay.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    },
    { passive: true }
  );

  overlay.addEventListener(
    "touchend",
    (event) => {
      if (scale > 1 || items.length < 2) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchX;
      const dy = touch.clientY - touchY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        show(index + (dx < 0 ? 1 : -1));
      }
    },
    { passive: true }
  );
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== "function") return;
  // 弹层内部的点击由弹层自己处理，这里不管
  if (target.closest(".lightbox, .share-modal")) return;
  const img = target.closest("article img") as HTMLImageElement | null;
  if (!img) return;
  // 太小的图（表情、图标）放大没意义
  if (Number(img.getAttribute("width") ?? 0) < 200 && img.naturalWidth < 200) return;
  const list = collect();
  if (!list.length) return;
  const src = img.currentSrc || img.src;
  const start = list.findIndex((item) => item.src === src);
  event.preventDefault();
  openAt(list, start < 0 ? 0 : start);
}

function handleKeydown(event: KeyboardEvent) {
  if (!overlay) return;
  if (event.key === "Escape") close();
  else if (event.key === "ArrowLeft") show(index - 1);
  else if (event.key === "ArrowRight") show(index + 1);
  else if (event.key === "+" || event.key === "=") {
    scale = Math.min(MAX_SCALE, scale * 1.25);
    paint();
  } else if (event.key === "-") {
    scale = Math.max(1, scale / 1.25);
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    paint();
  }
}

/** 任何带 <article> 的页面调一次即可；重复调用只绑一次监听。 */
export function setupLightbox() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeydown);
}

/** 换页前把还开着的弹层收掉，免得它挂在新页面上。 */
export function closeLightbox() {
  if (overlay) close();
}
