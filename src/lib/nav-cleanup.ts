/**
 * ClientRouter 每次导航都只换 <body>，文档本身不卸载，
 * 但页面脚本会重新执行一遍。
 *
 * 于是挂在 document / window 上的监听会越积越多，而且它们闭包里引用的
 * 还是上一页已经被换掉的元素（比如上一页的灯箱遮罩、上一页的分享菜单），
 * 点几下就会出现「关不掉 / 关错了」的怪现象。
 *
 * 这里统一登记这类监听，在导航前（astro:before-swap）一次性摘掉，
 * 再由新页面的脚本重新登记。
 */
type Off = () => void;

const registered: Off[] = [];

export function onDoc<K extends keyof DocumentEventMap>(
  type: K,
  fn: (event: DocumentEventMap[K]) => void,
) {
  const listener = fn as EventListener;
  document.addEventListener(type, listener);
  registered.push(() => document.removeEventListener(type, listener));
}

export function onWin(
  type: string,
  fn: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) {
  window.addEventListener(type, fn, options);
  registered.push(() => window.removeEventListener(type, fn, options));
}

/** 导航前调用：摘掉上一页登记的所有 document / window 监听 */
export function resetOnNavigate() {
  while (registered.length) {
    const off = registered.pop();
    try {
      off?.();
    } catch {
      // 摘不掉也不能挡住导航
    }
  }
}

/**
 * 换页后重新初始化页面上的交互。
 *
 * 为什么不能只靠「模块脚本重新执行」：换页时 Astro 会重新插入 <script type="module">，
 * 但同一个模块在本文档里只会执行一次。文章页和碎片页引用的是同一份分享脚本，
 * 从文章 A 跳到文章 B 时模块不会重跑，按钮就变成了没有监听的空壳——
 * 表现就是「分享按钮有时候要刷新一下页面才能用」。
 *
 * 所以初始化要挂在 astro:page-load 上；各 setup 函数自己按元素打标记，
 * 保证同一份 DOM 不会被绑两遍。
 */
const pageLoadHandlers = new Set<() => void>();
let pageLoadBound = false;

export function onPageLoad(fn: () => void) {
  pageLoadHandlers.add(fn);
  if (!pageLoadBound) {
    pageLoadBound = true;
    document.addEventListener("astro:page-load", () => {
      for (const handler of pageLoadHandlers) {
        try {
          handler();
        } catch (error) {
          console.error(error);
        }
      }
    });
  }
  // 首次加载时 astro:page-load 可能已经过去了，先补跑一次；
  // 各 setup 内部有幂等判断，重复调用是安全的。
  fn();
}
