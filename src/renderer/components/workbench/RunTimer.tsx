import { useEffect, useState } from "react";

/** m:ss (or h:mm:ss) elapsed since `startedAt`; "" for an unusable value. */
export function formatElapsed(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return "";
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Elapsed time of the running turn, ticking once a second. The start comes
 * from the session's run_started event, so a reload keeps the real elapsed
 * time instead of restarting from zero.
 */
export function RunTimer({ startedAt }: { readonly startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = formatElapsed(startedAt, now);
  if (!elapsed) return null;
  return (
    <span
      className="composer-run-timer"
      role="timer"
      aria-label={`已运行 ${elapsed}`}
    >
      <span className="composer-run-timer-dot" aria-hidden="true" />
      <span aria-hidden="true">{elapsed}</span>
    </span>
  );
}
