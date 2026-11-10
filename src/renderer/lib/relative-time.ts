const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const pad = (value: number) => String(value).padStart(2, "0");

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Short, locale-stable relative time for list rows (sidebar, welcome list).
 * Derived only from the session's own ISO timestamp and the local clock;
 * returns "" for an unparsable value so callers can omit the element.
 *
 * < 1 min 刚刚 · < 1 h N 分钟前 · today HH:mm · 昨天 · < 7 days 周X ·
 * same year M/D · else YYYY/M/D
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const diff = now.getTime() - time;
  if (diff >= 0 && diff < 60_000) return "刚刚";
  if (diff >= 0 && diff < 3_600_000)
    return `${Math.floor(diff / 60_000)} 分钟前`;
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (days === 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days === 1) return "昨天";
  if (days > 1 && days < 7) return WEEKDAYS[date.getDay()] ?? "";
  if (date.getFullYear() === now.getFullYear())
    return `${date.getMonth() + 1}/${date.getDate()}`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** Time-of-day greeting from the local clock (no user name: none is known). */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 13) return "中午好";
  if (hour >= 13 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

/** "11 月 10 日 · 周二" for the welcome eyebrow. */
export function dateEyebrow(now: Date = new Date()): string {
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAYS[now.getDay()]}`;
}
