/* Applies the last saved appearance before first paint so light-theme users do not get a dark flash. */
try {
  const saved = JSON.parse(localStorage.getItem("lucent:appearance") || "null");
  if (saved) {
    const root = document.documentElement;
    const dark =
      saved.theme === "dark" ||
      (saved.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.wall = saved.wall || "ash";
    root.dataset.glass = saved.glass || "tinted";
    root.dataset.accent = saved.accent || "blue";
    root.dataset.solid = String(!!saved.solid);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0a0c" : "#e9ecf3");
  }
} catch {}
