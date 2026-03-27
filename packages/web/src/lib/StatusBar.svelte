<script>
  let { aggregateState = "idle", statusMessage = "", sessionCount = 0, disconnected = false } = $props();

  let dotClass = $derived(disconnected ? "dot-disconnected" : `dot-${aggregateState}`);
</script>

<div class="status-bar" class:pending={!disconnected && aggregateState === "pending"}>
  <span class="dot {dotClass}"></span>
  <span class="message">{statusMessage}</span>
  <span class="count">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    margin: 12px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    transition: all 150ms ease;
  }

  .status-bar.pending {
    background: rgba(229, 160, 58, 0.14);
    border-color: rgba(229, 160, 58, 0.35);
    box-shadow: 0 0 16px rgba(229, 160, 58, 0.1);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy { background: var(--blue); }
  .dot-pending { background: var(--amber); }
  .dot-disconnected {
    background: var(--gray);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-disconnected { animation: none; }
  }

  .message { flex: 1; }

  .count {
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
