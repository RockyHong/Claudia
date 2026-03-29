<script>
  let { oninstalled } = $props();

  let checking = $state(true);
  let installed = $state(false);
  let installing = $state(false);
  let error = $state("");

  async function checkStatus() {
    try {
      const res = await fetch("/api/hooks/status");
      const data = await res.json();
      installed = data.installed;
      if (installed) oninstalled?.();
    } catch {
      installed = false;
    } finally {
      checking = false;
    }
  }

  async function installHooks() {
    installing = true;
    error = "";
    try {
      const res = await fetch("/api/hooks/install", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        installed = true;
        oninstalled?.();
      } else {
        error = data.error || "Installation failed";
      }
    } catch (err) {
      error = "Could not reach server";
    } finally {
      installing = false;
    }
  }

  checkStatus();
</script>

{#if !checking && !installed}
  <div class="hook-gate">
    <div class="hook-gate-card">
      <div class="icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <h2>Connect to Claude Code</h2>
      <p>Claudia needs to install hooks in Claude Code to monitor your sessions.</p>
      {#if error}
        <p class="error">{error}</p>
      {/if}
      <button class="install-btn" onclick={installHooks} disabled={installing}>
        {installing ? "Installing…" : "Install Hooks"}
      </button>
    </div>
  </div>
{/if}

<style>
  .hook-gate {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hook-gate-card {
    text-align: center;
    max-width: 480px;
    width: 90%;
    padding: var(--space-10) var(--space-8);
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
    margin-bottom: var(--space-6);
  }

  .error {
    color: var(--red);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }

  .install-btn {
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

  .install-btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .install-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
