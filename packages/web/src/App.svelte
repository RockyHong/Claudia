<script>
  import { createSSEClient } from "./lib/sse.js";
  import { createSFXController } from "./lib/sfx.js";
  import SessionList from "./lib/SessionList.svelte";
  import StatusBar from "./lib/StatusBar.svelte";
  import AvatarPanel from "./lib/AvatarPanel.svelte";
  import SettingsModal from "./lib/SettingsModal.svelte";
  import AvatarModal from "./lib/AvatarModal.svelte";
  import SpawnPopover from "./lib/SpawnPopover.svelte";
  import HookGate from "./lib/HookGate.svelte";

  let sessions = $state([]);
  let aggregateState = $state("idle");
  let statusMessage = $state("");
  let bgMode = $state(false);
  let showSettings = $state(false);
  let showAvatarModal = $state(false);
  let showSpawn = $state(false);
  let usage = $state(null);
  let avatarVersion = $state(0);
  let sseConnected = $state(true);
  let hooksPassed = $state(false);
  let nightMode = $state(true);
  let usageMonitoring = $state(false);
  let autoFocus = $state(true);

  const sfx = createSFXController();

  async function loadPreferences() {
    try {
      const res = await fetch("/api/preferences");
      const prefs = await res.json();
      nightMode = prefs.theme !== "light";
      bgMode = prefs.immersive;
      sfx.muted = prefs.sfx.muted;
      sfx.volume = prefs.sfx.volume;
      applyTheme(nightMode, false);
      usageMonitoring = prefs.usageMonitoring === true;
      autoFocus = prefs.autoFocus !== false;
    } catch {
      // Fallback defaults already set
    }
  }

  function applyTheme(dark, persist = true) {
    document.documentElement.classList.toggle("light", !dark);
    if (persist) {
      fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: dark ? "dark" : "light" }),
      }).catch(() => {});
    }
  }

  function setUsageMonitoring(enabled) {
    usageMonitoring = enabled;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usageMonitoring: enabled }),
    }).catch(() => {});
  }

  function setAutoFocus(enabled) {
    autoFocus = enabled;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoFocus: enabled }),
    }).catch(() => {});
  }

  loadPreferences();

  const sseClient = createSSEClient("/events", (update) => {
    // SFX-only messages (e.g. "send" on UserPromptSubmit) have no sessions
    if (update.sessions) {
      sessions = update.sessions;
      aggregateState = update.aggregateState;
      statusMessage = update.statusMessage || "";
      usage = update.usage || null;
      updateDocumentTitle(update.aggregateState, update.sessions);
    }

    // Play sounds pushed from server
    if (update.sfx) {
      for (const sound of update.sfx) {
        sfx.play(sound);
      }
    }
  }, (connected) => {
    sseConnected = connected;
  });

  function updateDocumentTitle(state, sessions) {
    const pendingCount = sessions.filter((s) => s.state === "pending").length;
    if (pendingCount > 0) {
      document.title = `(${pendingCount} pending) Claudia*`;
    } else {
      document.title = "Claudia*";
    }
    updateFavicon(state);
  }

  let lastFaviconState = "";

  function updateFavicon(state) {
    if (state === lastFaviconState) return;
    lastFaviconState = state;

    const style = getComputedStyle(document.documentElement);
    const colorMap = {
      idle: style.getPropertyValue("--green").trim(),
      busy: style.getPropertyValue("--blue").trim(),
      pending: style.getPropertyValue("--amber").trim(),
    };

    const color = colorMap[state] || colorMap.idle;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/></svg>`;
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  }

</script>

{#if !hooksPassed}
  <HookGate oninstalled={() => hooksPassed = true} />
{/if}

<div class="app" class:bg-mode={bgMode}>
  <header>
    <h1><span>Claudia*</span></h1>
    <div class="header-actions">
      {#if bgMode}
        <button class="header-btn" aria-label="Exit immersive" onclick={() => {
          bgMode = false;
          fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ immersive: false }),
          }).catch(() => {});
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 4l6 6"/><path d="M10 14l-6 6"/></svg>
        </button>
      {/if}
      <button class="header-btn" onclick={() => showAvatarModal = true}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 8h.01M3 16l5-5a2.5 2.5 0 0 1 3.5 0l5 5"/><path d="M14 14l1-1a2.5 2.5 0 0 1 3.5 0L21 16"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        {#if !bgMode}Avatar{/if}
      </button>
      <button class="header-btn" onclick={() => showSettings = true}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        {#if !bgMode}Settings{/if}
      </button>
    </div>
  </header>

  <AvatarPanel {aggregateState} background={bgMode} version={avatarVersion} onavatarclick={() => showAvatarModal = true} onimmersive={() => {
    bgMode = true;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immersive: true }),
    }).catch(() => {});
  }} />

  <main>
    <SessionList {sessions} {showSpawn} {usage} {usageMonitoring} immersive={bgMode} onusagemonitoringchange={setUsageMonitoring} ontogglespawn={() => showSpawn = !showSpawn} />
  </main>

  {#if showSettings}
    <SettingsModal
      onclose={() => showSettings = false}
      {sfx}
      {nightMode}
      onnightmodechange={(v) => { nightMode = v; applyTheme(v); }}
      {usageMonitoring}
      onusagemonitoringchange={setUsageMonitoring}
      {autoFocus}
      onautofocuschange={setAutoFocus}
      onhooksremoved={() => {
        sessions = [];
        aggregateState = "idle";
        statusMessage = "";
        hooksPassed = false;
        showSettings = false;
      }}
    />
  {/if}

  {#if showSpawn}
    <SpawnPopover onclose={() => showSpawn = false} />
  {/if}

  {#if showAvatarModal}
    <AvatarModal
      onclose={() => showAvatarModal = false}
      onavatarchange={() => avatarVersion++}
    />
  {/if}
</div>

<StatusBar {aggregateState} statusMessage={sseConnected ? statusMessage : "Disconnected — retrying…"} sessionCount={sessions.length} disconnected={!sseConnected} immersive={bgMode} />

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    /* Brand */
    --brand: #c15f3c;
    --brand-hover: #d97b56;

    /* Surfaces */
    --bg: #141110;
    --bg-card: #1c1816;
    --bg-raised: #252019;
    --border: #302922;
    --border-active: #3d332a;

    /* Text */
    --text: #ede6df;
    --text-muted: #948b82;
    --text-faint: #5c554e;

    /* Semantic */
    --green: #4aba6a;
    --blue: #5b8fd9;
    --amber: #e5a03a;
    --red: #d95555;
    --gray: #5c554e;

    /* Typography */
    --font-heading: 'Space Grotesk', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    /* Animation */
    --duration-fast: 100ms;
    --duration-normal: 150ms;
    --duration-slow: 300ms;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

    /* Spacing */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    --space-10: 40px;

    /* Text sizes */
    --text-xs: 0.75rem;
    --text-sm: 0.8125rem;
    --text-base: 0.9375rem;
    --text-lg: 1.125rem;
    --text-xl: 1.5rem;
    --text-2xl: 2rem;

    /* Border radius */
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;

  }

  :global(:root.light) {
    --bg: #faf7f5;
    --bg-card: #ffffff;
    --bg-raised: #f3eeea;
    --border: #e8e1da;
    --border-active: #d4cac0;
    --text: #1c1816;
    --text-muted: #6e655d;
    --text-faint: #a39a91;
    --brand: #a84e31;
    --brand-hover: #c15f3c;
    --green: #2d9a4e;
    --blue: #3a75c4;
    --amber: #c4880f;
    --red: #c43c3c;
    --gray: #a39a91;
  }

  :global(body) {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    overflow-x: hidden;
  }

  .app {
    max-width: 640px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 0 16px 40px;
  }

  @media (max-width: 480px) {
    .app {
      max-width: 100%;
    }
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 32px 0 0;
  }

  h1 {
    font-family: var(--font-heading);
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  h1 span {
    font-family: 'Roboto Slab', serif;
    color: var(--brand);
  }

  main {
    flex: 1;
    padding: 32px 0 64px;
  }

  .header-actions {
    position: relative;
    display: flex;
    gap: 8px;
  }

  .header-btn {
    font-family: var(--font-body);
    font-size: 0.8125rem;
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
  }

  .header-btn:hover {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }


  .app.bg-mode .header-actions {
    padding: 0;
    gap: 4px;
  }

  .app.bg-mode .header-btn {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-color: transparent;
    color: rgba(255, 255, 255, 0.7);
  }

  .app.bg-mode .header-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: transparent;
    color: rgba(255, 255, 255, 0.9);
  }


  /* Background / immersive mode */
  .app.bg-mode {
    max-width: 100%;
    padding: 0 16px;
    background: transparent;
  }

  .app.bg-mode::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 160px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, transparent 100%);
    pointer-events: none;
    z-index: 1;
  }

  .app.bg-mode header {
    position: relative;
    z-index: 2;
    padding: 16px 0 0;
    background: transparent;
    color: #fff;
  }

  .app.bg-mode h1 {
    color: #fff;
  }

  .app.bg-mode h1 span {
    color: #eb9e80;
  }

  .app.bg-mode main {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    max-width: 600px;
  }

  .app.bg-mode :global(.card) {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .app.bg-mode :global(.card.pending) {
    background: rgba(229, 160, 58, 0.15);
    border-color: rgba(229, 160, 58, 0.25);
    box-shadow: none;
  }

  .app.bg-mode :global(.card .name) {
    color: #fff;
  }

  .app.bg-mode :global(.card .card-state) {
    color: rgba(255, 255, 255, 0.35);
  }

  .app.bg-mode :global(.card .card-detail) {
    color: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.card .card-detail svg) {
    stroke: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.usage-rings .ring-bg) {
    stroke: rgba(255, 255, 255, 0.08);
  }

  .app.bg-mode :global(.usage-rings .ring-fill) {
    stroke: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.usage-rings .ring-item) {
    color: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.card .orphan-badge) {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.35);
  }

  .app.bg-mode :global(.card .orphan-badge:hover) {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
  }

  .app.bg-mode :global(.card .detail-icon-btn) {
    color: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.card .detail-icon-btn:hover) {
    color: rgba(255, 255, 255, 0.5);
  }

  .app.bg-mode :global(.tool-context) {
    background: rgba(229, 160, 58, 0.1);
    color: var(--amber);
  }

  .app.bg-mode :global(.inline-actions) {
    border-top-color: rgba(229, 160, 58, 0.15);
  }

  .app.bg-mode :global(.action-approve) {
    background: rgba(74, 186, 106, 0.12);
    color: var(--green);
    border-color: rgba(74, 186, 106, 0.25);
  }

  .app.bg-mode :global(.action-deny) {
    background: rgba(217, 85, 85, 0.08);
    color: var(--red);
    border-color: rgba(217, 85, 85, 0.15);
  }

  .app.bg-mode :global(.link-dropdown) {
    top: auto;
    bottom: 100%;
  }

  .app.bg-mode :global(.backdrop) {
    background: rgba(0, 0, 0, 0.6);
  }

  .app.bg-mode :global(.modal) {
    background: rgba(20, 17, 16, 0.85);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .app.bg-mode :global(.modal-header) {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

</style>
