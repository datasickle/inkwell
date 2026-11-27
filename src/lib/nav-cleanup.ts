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
