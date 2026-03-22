<script>
  let { session } = $props();

  const stateConfig = {
    idle: { dot: "dot-idle", label: "Idle" },
    working: { dot: "dot-working", label: "Working" },
    pending: { dot: "dot-pending", label: "Needs you" },
    thinking: { dot: "dot-thinking", label: "Thinking" },
  };

  let elapsed = $state("");

  $effect(() => {
    const interval = setInterval(() => {
      elapsed = formatElapsed(session.lastEvent);
    }, 1000);
    elapsed = formatElapsed(session.lastEvent);
    return () => clearInterval(interval);
  });

  function formatElapsed(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  async function handleFocus() {
    try {
      await fetch(`/focus/${session.id}`, { method: "POST" });
    } catch {
      // Best effort
    }
  }

  let config = $derived(stateConfig[session.state] || stateConfig.idle);
</script>

<div class="card {session.state}">
  <div class="card-main">
    <span class="dot {config.dot}"></span>
    <div class="card-info">
      <span class="name">{session.displayName}</span>
      <span class="meta">
        {config.label}
        {#if session.lastTool}
          &middot; {session.lastTool}
        {/if}
        &middot; {elapsed}
      </span>
    </div>
  </div>

  {#if session.pendingMessage}
    <div class="pending-msg">{session.pendingMessage}</div>
  {/if}

  <button class="focus-btn" onclick={handleFocus} title="Focus terminal">
    &rarr;
  </button>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    transition: border-color 0.2s;
  }

  .card.pending {
    border-color: var(--orange);
  }

  .card-main {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 12px;
    color: var(--text-muted);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle {
    background: var(--gray);
  }
  .dot-working {
    background: var(--blue);
    animation: pulse 2s infinite;
  }
  .dot-pending {
    background: var(--orange);
    animation: pulse 1s infinite;
  }
  .dot-thinking {
    background: var(--purple);
    animation: pulse 3s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .pending-msg {
    font-size: 12px;
    color: var(--orange);
    flex-shrink: 1;
  }

  .focus-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 14px;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .focus-btn:hover {
    background: var(--border);
    color: var(--text);
  }
</style>
