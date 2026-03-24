<script>
  import { createSSEClient } from "./lib/sse.js";
  import { createSFXController } from "./lib/sfx.js";
  import SessionList from "./lib/SessionList.svelte";
  import StatusBar from "./lib/StatusBar.svelte";
  import AvatarPanel from "./lib/AvatarPanel.svelte";
  import SettingsModal from "./lib/SettingsModal.svelte";
  import SpawnPopover from "./lib/SpawnPopover.svelte";

  let sessions = $state([]);
  let aggregateState = $state("idle");
  let statusMessage = $state("");
  let previousStates = $state(new Map());
  let bgMode = $state(false);
  let showSettings = $state(false);
  let showSpawn = $state(false);
  let avatarVersion = $state(0);

  const sfx = createSFXController();

  const sseClient = createSSEClient("/events", (update) => {
    sessions = update.sessions;
    aggregateState = update.aggregateState;
    statusMessage = update.statusMessage || "";
    handleSessionTransitions(update.sessions);
    updateDocumentTitle(update.aggregateState, update.sessions);
  });

  function handleSessionTransitions(currentSessions) {
    const newStates = new Map();

    for (const s of currentSessions) {
      const prev = previousStates.get(s.id);
      newStates.set(s.id, s.state);

      if (prev === s.state) continue;

      if (s.state === "pending") {
        sendNotification(s);
        sfx.playPending();
      } else if (s.state === "busy") {
        sfx.playBusy();
      } else if (s.state === "idle" && prev) {
        sfx.playIdle();
      }
    }

    previousStates = newStates;
  }

  function sendNotification(session) {
    if (Notification.permission === "default") {
      Notification.requestPermission();
      return;
    }
    if (Notification.permission !== "granted") return;

    const body = session.pendingMessage || "Needs your attention";
    const n = new Notification(`Claudia: ${session.displayName}`, { body });
    n.onclick = () => {
      window.focus();
      n.close();
    };
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
      pending: style.getPropertyValue("--orange").trim(),
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

  function requestNotificationPermission() {
    Notification.requestPermission();
  }
</script>

<div class="app" class:bg-mode={bgMode}>
  <header>
    <h1>Claudia</h1>
    <div class="header-actions">
      <div class="spawn-anchor">
        <button class="header-btn" onclick={() => showSpawn = !showSpawn}>New agent</button>
        {#if showSpawn}
          <SpawnPopover onclose={() => showSpawn = false} />
        {/if}
      </div>
      {#if typeof Notification !== "undefined" && Notification.permission === "default"}
        <button class="header-btn" onclick={requestNotificationPermission}>
          Enable notifications
        </button>
      {/if}
      <button class="header-btn" class:active={bgMode} onclick={() => bgMode = !bgMode}>
        Immersive
      </button>
      <button class="header-btn" onclick={() => showSettings = true}>
        Settings
      </button>
    </div>
  </header>

  <AvatarPanel {aggregateState} background={bgMode} version={avatarVersion} />

  <main>
    <SessionList {sessions} />
  </main>

  <StatusBar {aggregateState} {statusMessage} sessionCount={sessions.length} />

  {#if showSettings}
    <SettingsModal
      onclose={() => showSettings = false}
      onavatarchange={() => avatarVersion++}
      {sfx}
    />
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --bg: #0f1117;
    --card-bg: #1a1d27;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --text-muted: #8b8fa3;
    --gray: #6b7280;
    --green: #22c55e;
    --blue: #3b82f6;
    --orange: #f59e0b;
  }

  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #f8f9fb;
      --card-bg: #ffffff;
      --border: #e2e4ea;
      --text: #1a1d27;
      --text-muted: #6b7280;
      --gray: #9ca3af;
      --green: #16a34a;
      --blue: #2563eb;
      --orange: #d97706;
    }
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    overflow-x: hidden;
  }

  .app {
    max-width: 600px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
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
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: 18px;
    font-weight: 700;
  }

  main {
    flex: 1;
    padding: 12px;
  }

  .header-actions {
    position: relative;
    display: flex;
    gap: 8px;
  }

  .spawn-anchor {
    display: flex;
  }

  .header-btn {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .header-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  .header-btn.active {
    background: var(--border);
    border-color: var(--text-muted);
    color: var(--text);
  }

  .app.bg-mode .header-btn {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }

  .app.bg-mode .header-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  .app.bg-mode .header-btn.active {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
  }

  /* Background / immersive mode */
  .app.bg-mode {
    max-width: 100%;
    background: transparent;
  }

  .app.bg-mode header {
    position: relative;
    z-index: 2;
    background: transparent;
    border-bottom-color: transparent;
    color: #fff;
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

  .app.bg-mode :global(.status-bar) {
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(12px);
    border-top-color: rgba(255, 255, 255, 0.1);
  }

  .app.bg-mode :global(.card) {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .app.bg-mode :global(.card.pending) {
    border-color: var(--orange);
  }
</style>
