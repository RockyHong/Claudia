<script>
  let { onchoice } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" onkeydown={() => {}} role="dialog" aria-modal="true" aria-label="Usage Monitoring">
  <div class="consent-card">
    <div class="icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    </div>
    <h2>Usage Monitoring</h2>
    <p>
      Claudia can show your Claude usage limits (5-hour and 7-day) on the dashboard.
    </p>
    <p>
      To do this, she reads your token from <code>~/.claude/.credentials.json</code> and
      calls the Anthropic API to check your current utilization. The token is used in memory
      only — it is never stored or sent anywhere else.
    </p>
    <div class="actions">
      <button class="btn primary" onclick={() => onchoice(true)}>
        Enable
      </button>
      <button class="btn secondary" onclick={() => onchoice(false)}>
        No thanks
      </button>
    </div>
    <p class="hint">You can change this later in Settings.</p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 8, 7, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .consent-card {
    text-align: center;
    max-width: 400px;
    padding: 48px 32px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .icon {
    color: var(--brand);
    margin-bottom: 24px;
  }

  h2 {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 12px;
  }

  p {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.6;
    margin-bottom: 16px;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin: 24px 0 16px;
  }

  .btn {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    padding: 12px 32px;
    cursor: pointer;
    transition: background var(--duration-normal) var(--ease-in-out);
  }

  .btn.primary {
    background: var(--brand);
    color: #fff;
  }

  .btn.primary:hover {
    background: var(--brand-hover);
  }

  .btn.secondary {
    background: var(--bg-raised);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .btn.secondary:hover {
    background: var(--bg-card);
    color: var(--text);
    border-color: var(--border-active);
  }

  .hint {
    color: var(--text-faint);
    font-size: 0.75rem;
    margin-bottom: 0;
  }
</style>
