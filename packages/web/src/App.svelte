<script>
  import { createSSEClient } from "./lib/sse.js";
  import { createSFXController } from "./lib/sfx.js";
  import SessionList from "./lib/SessionList.svelte";
  import StatusBar from "./lib/StatusBar.svelte";
  import AvatarPanel from "./lib/AvatarPanel.svelte";
  import SettingsModal from "./lib/SettingsModal.svelte";

  let sessions = $state([]);
  let aggregateState = $state("idle");
  let statusMessage = $state("");
  let previousStates = $state(new Map());
  let bgMode = $state(localStorage.getItem("claudia-immersive") === "true");
  let showSettings = $state(false);
  let showSpawn = $state(false);
  let usage = $state(null);
  let avatarVersion = $state(0);
  let sseConnected = $state(true);
  let nightMode = $state(localStorage.getItem("claudia-theme") !== "light");

  function applyTheme(dark) {
    document.documentElement.classList.toggle("light", !dark);
    localStorage.setItem("claudia-theme", dark ? "dark" : "light");
  }

  applyTheme(localStorage.getItem("claudia-theme") !== "light");

  const sfx = createSFXController();

  const sseClient = createSSEClient("/events", (update) => {
    sessions = update.sessions;
    aggregateState = update.aggregateState;
    statusMessage = update.statusMessage || "";
    usage = update.usage || null;
    handleSessionTransitions(update.sessions);
    updateDocumentTitle(update.aggregateState, update.sessions);
  }, (connected) => {
    sseConnected = connected;
  });

  function handleSessionTransitions(currentSessions) {
    const newStates = new Map();

    for (const s of currentSessions) {
      const prev = previousStates.get(s.id);
      newStates.set(s.id, s.state);

      if (prev === s.state) continue;

      if (s.state === "pending") {
        sfx.playPending();
      } else if (s.state === "busy") {
        sfx.playBusy();
      } else if (s.state === "idle" && prev) {
        sfx.playIdle();
      }
    }

    previousStates = newStates;
  }

  function updateDocumentTitle(state, sessions) {
    const pendingCount = sessions.filter((s) => s.state === "pending").length;
    if (pendingCount > 0) {
      document.title = `(${pendingCount} pending) Claudia`;
    } else {
      document.title = "Claudia";
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

<div class="app" class:bg-mode={bgMode}>
  <header>
    <h1><span>Claudia</span></h1>
    <div class="header-actions">
      <button class="header-btn" onclick={() => showSettings = true}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        {#if !bgMode}Settings{/if}
      </button>
      <button class="header-btn" class:active={bgMode} onclick={() => { bgMode = !bgMode; localStorage.setItem("claudia-immersive", bgMode); }}>
        {#if bgMode}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 4l6 6"/><path d="M10 14l-6 6"/></svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          Immersive
        {/if}
      </button>
    </div>
  </header>

  <AvatarPanel {aggregateState} background={bgMode} version={avatarVersion} />

  <main>
    <SessionList {sessions} {showSpawn} {usage} immersive={bgMode} ontogglespawn={() => showSpawn = !showSpawn} onclosespawn={() => showSpawn = false} />
  </main>

  {#if showSettings}
    <SettingsModal
      onclose={() => showSettings = false}
      onavatarchange={() => avatarVersion++}
      {sfx}
      {nightMode}
      onnightmodechange={(v) => { nightMode = v; applyTheme(v); }}
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

  .header-btn.active {
    background: var(--brand);
    color: #fff;
    border-color: var(--brand);
  }

  .header-btn.active:hover {
    background: var(--brand-hover);
    border-color: var(--brand-hover);
  }

  .app.bg-mode .header-btn {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
  }

  .app.bg-mode .header-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .app.bg-mode .header-btn.active {
    background: rgba(193, 95, 60, 0.3);
    border-color: rgba(193, 95, 60, 0.4);
    color: #fff;
  }

  /* Background / immersive mode */
  .app.bg-mode {
    max-width: 100%;
    padding: 0 16px;
    background: transparent;
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
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
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
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
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

</style>
