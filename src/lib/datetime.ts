/**
 * 站点时区固定为东八区。
 *
 * Cloudflare 的构建机跑在 UTC，本机预览跑在 +08:00。文章时间一旦只按
 * `Date` 的本地 getter 取，同一篇文章在两边算出的「日」会差一天——
 * 凌晨发的文章在 UTC 那边会被归到前一天，首页分组和归档全错位。
 * 所以所有对外显示的日期都走这里，先按 Asia/Shanghai 折算再格式化。
 *
 * 中国全境不使用夏令时，UTC+8 是恒定的，可以直接写死偏移。
 */
export const SITE_TZ = "Asia/Shanghai";
export const SITE_OFFSET = "+08:00";

const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SITE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface DateParts {
  y: string;
  m: string;
  d: string;
  hh: string;
  mm: string;
  ss: string;
}

export function partsOf(date: Date): DateParts {
  const bag: Record<string, string> = {};
  for (const { type, value } of FORMATTER.formatToParts(date)) {
    bag[type] = value;
  }
  return {
    y: bag.year,
    m: bag.month,
    d: bag.day,
    // en-CA 在午夜会把小时给成 24，统一折成 00
    hh: bag.hour === "24" ? "00" : bag.hour,
    mm: bag.minute,
    ss: bag.second,
  };
}

export function yearOf(date: Date): number {
  return Number(partsOf(date).y);
}

/** 2026/11/23 —— 标签页那种紧凑写法 */
export function fmtDate(date: Date): string {
  const { y, m, d } = partsOf(date);
  return `${y}/${m}/${d}`;
}

/** 11/23 —— 归档页用，年份已经在分组标题里 */
export function fmtMonthDay(date: Date): string {
  const { m, d } = partsOf(date);
  return `${m}/${d}`;
}

/** 2026/11/23 20:14:07 —— 文章页主时间，精确到秒 */
export function fmtFull(date: Date): string {
  const { y, m, d, hh, mm, ss } = partsOf(date);
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

/** 11/23 20:14 —— 列表、上下篇这种空间紧张的地方 */
export function fmtShort(date: Date): string {
  const { m, d, hh, mm } = partsOf(date);
  return `${m}/${d} ${hh}:${mm}`;
}

/** 2026-11-23T20:14:07+08:00 —— <time datetime> 用，机器可读且不带歧义 */
export function isoZoned(date: Date): string {
  const { y, m, d, hh, mm, ss } = partsOf(date);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${SITE_OFFSET}`;
}
