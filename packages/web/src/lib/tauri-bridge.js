// Tauri desktop integration — external links open via server API.
// No-ops gracefully when running in a regular browser.

/** Intercept target="_blank" clicks and open in system browser via server API. */
function initExternalLinks() {
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest('a[target="_blank"]');
    if (!anchor) return;
    e.preventDefault();
    const url = anchor.href;
    fetch("/api/open-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {
      // Fallback: try native window.open
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

export function initTauriBridge() {
  initExternalLinks();
}
