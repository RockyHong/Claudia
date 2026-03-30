// Tauri desktop integration — external links + F11 fullscreen toggle.
// No-ops gracefully when running in a regular browser.

function getTauri() {
  return window.__TAURI_INTERNALS__ || window.__TAURI__;
}

function isTauri() {
  return !!getTauri();
}

async function invoke(cmd, args) {
  const t = getTauri();
  if (t?.core?.invoke) return t.core.invoke(cmd, args);
  if (t?.invoke) return t.invoke(cmd, args);
}

/** Intercept target="_blank" clicks and open in system browser via Tauri opener plugin. */
function initExternalLinks() {
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest('a[target="_blank"]');
    if (!anchor) return;
    e.preventDefault();
    const url = anchor.href;
    if (isTauri()) {
      invoke("plugin:opener|open_url", { url }).catch(() => {
        // Fallback: try shell open command format
        invoke("plugin:opener|open_path", { path: url }).catch(() => {});
      });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });
}

/** Toggle native fullscreen via Tauri window API. */
async function toggleFullscreen() {
  if (!isTauri()) return;
  try {
    const label = "main";
    const isFs = await invoke("plugin:window|is_fullscreen", { label });
    await invoke("plugin:window|set_fullscreen", { label, value: !isFs });
  } catch {
    // silent fail in browser
  }
}

/** F11 toggles native fullscreen in Tauri desktop. */
function initFullscreenToggle() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "F11") return;
    e.preventDefault();
    toggleFullscreen();
  });
}

/** Right-click context menu with fullscreen toggle. */
function initContextMenu() {
  if (!isTauri()) return;

  const menu = document.createElement("div");
  menu.className = "tauri-context-menu";
  menu.innerHTML = `<button class="tauri-ctx-item" data-action="fullscreen">Toggle Fullscreen</button>`;
  menu.style.cssText = `
    display: none; position: fixed; z-index: 99999;
    background: var(--bg-card, #1c1816); border: 1px solid var(--border, #302922);
    border-radius: 6px; padding: 4px; min-width: 160px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    font-family: var(--font-body, sans-serif); font-size: 0.8125rem;
  `;
  document.body.appendChild(menu);

  const itemStyle = `
    display: block; width: 100%; padding: 6px 12px;
    background: none; border: none; border-radius: 4px;
    color: var(--text, #ede6df); cursor: pointer; text-align: left;
    font: inherit;
  `;
  menu.querySelector("button").style.cssText = itemStyle;

  menu.querySelector("button").addEventListener("mouseenter", (e) => {
    e.target.style.background = "var(--bg-raised, #252019)";
  });
  menu.querySelector("button").addEventListener("mouseleave", (e) => {
    e.target.style.background = "none";
  });

  function hide() { menu.style.display = "none"; }

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 50)}px`;
    menu.style.display = "block";
  });

  menu.querySelector('[data-action="fullscreen"]').addEventListener("click", () => {
    hide();
    toggleFullscreen();
  });

  document.addEventListener("click", hide);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
}

export function initTauriBridge() {
  initExternalLinks();
  initFullscreenToggle();
  initContextMenu();
}
