<script>
let { onretry } = $props();

let retrying = $state(false);

function _retry() {
	retrying = true;
	onretry?.();
	setTimeout(() => (retrying = false), 2000);
}
</script>

<div class="disconnect-gate">
  <div class="disconnect-card">
    <div class="icon">
      <WifiOff size={48} strokeWidth={1.5} />
    </div>
    <h2>Server disconnected</h2>
    <p>Claudia will reconnect automatically when the server is available.</p>
    <button class="retry-btn" onclick={retry} disabled={retrying}>
      {retrying ? "Retrying…" : "Retry Now"}
    </button>
    <p class="hint">
      Need help? See the <a href="https://github.com/RockyHong/Claudia/blob/main/docs/troubleshooting.md" target="_blank" rel="noopener noreferrer">troubleshooting guide</a>.
    </p>
  </div>
</div>

<style>
  .disconnect-gate {
    position: fixed;
    inset: 0;
    z-index: 250;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .disconnect-card {
    text-align: center;
    max-width: 480px;
    width: 90%;
    padding: var(--space-10) var(--space-8);
  }

  .icon {
    color: var(--red);
    margin-bottom: var(--space-6);
  }

  h2 {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-3);
  }

  p {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.6;
    margin-bottom: var(--space-6);
  }

  .retry-btn {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 500;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: var(--space-3) var(--space-6);
    min-height: 44px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: background var(--duration-normal) var(--ease-in-out);
  }

  .retry-btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .retry-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    color: var(--text-faint);
    font-size: var(--text-xs);
    margin-top: var(--space-4);
    margin-bottom: 0;
  }

  .hint a {
    color: var(--brand);
    text-decoration: none;
  }

  .hint a:hover {
    color: var(--brand-hover);
    text-decoration: underline;
  }
</style>
