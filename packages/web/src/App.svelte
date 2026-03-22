<script>
  import { createSSEClient } from "./lib/sse.js";
  import SessionList from "./lib/SessionList.svelte";
  import StatusBar from "./lib/StatusBar.svelte";

  let sessions = $state([]);
  let aggregateState = $state("idle");
  let previousPendingIds = $state(new Set());

  const sseClient = createSSEClient("/events", (update) => {
    sessions = update.sessions;
    aggregateState = update.aggregateState;
    checkForPendingNotifications(update.sessions);
    updateDocumentTitle(update.aggregateState, update.sessions);
  });

  function checkForPendingNotifications(currentSessions) {
    const currentPendingIds = new Set(
      currentSessions.filter((s) => s.state === "pending").map((s) => s.id)
    );

    for (const s of currentSessions) {
      if (s.state === "pending" && !previousPendingIds.has(s.id)) {
        sendNotification(s);
      }
    }

    previousPendingIds = currentPendingIds;
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
  }

  function requestNotificationPermission() {
    Notification.requestPermission();
  }
</script>

<div class="app">
  <header>
    <h1>Claudia</h1>
    {#if typeof Notification !== "undefined" && Notification.permission === "default"}
      <button class="notify-btn" onclick={requestNotificationPermission}>
        Enable notifications
      </button>
    {/if}
  </header>

  <main>
    <SessionList {sessions} />
  </main>

  <StatusBar {aggregateState} sessionCount={sessions.length} />
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
    --blue: #3b82f6;
    --orange: #f59e0b;
    --purple: #8b5cf6;
  }

  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #f8f9fb;
      --card-bg: #ffffff;
      --border: #e2e4ea;
      --text: #1a1d27;
      --text-muted: #6b7280;
      --gray: #9ca3af;
      --blue: #2563eb;
      --orange: #d97706;
      --purple: #7c3aed;
    }
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }

  .app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
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

  .notify-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .notify-btn:hover {
    background: var(--border);
    color: var(--text);
  }
</style>
