// Runs synchronously before first paint so the page does not flash dark while
// settings load. Mirrors the theme effect in state/workbench-context.tsx.
(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("forge:theme-preference") || preference;
  } catch {}
  document.documentElement.dataset.theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference === "light"
        ? "light"
        : "dark";
})();
