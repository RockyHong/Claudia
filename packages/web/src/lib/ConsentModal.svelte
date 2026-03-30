<script>
  import { BarChart3 } from "lucide-svelte";

  let { onchoice } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" onkeydown={() => {}} role="dialog" aria-modal="true" aria-label="Usage Monitoring" tabindex="-1">
  <div class="consent-card">
    <div class="icon">
      <BarChart3 size={40} strokeWidth={1.5} />
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
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .consent-card {
    text-align: center;
    max-width: 480px;
    width: 90%;
    padding: var(--space-10) var(--space-8);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .icon {
    color: var(--brand);
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
    margin-bottom: var(--space-4);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    margin: var(--space-6) 0 var(--space-4);
  }

  .btn {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 500;
    border: none;
    border-radius: 10px;
    padding: var(--space-3) var(--space-6);
    min-height: 44px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
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
    font-size: var(--text-xs);
    margin-bottom: 0;
  }
</style>
