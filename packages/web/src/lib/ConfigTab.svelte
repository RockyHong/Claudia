<script>
  import ToggleSlider from "./ToggleSlider.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import ConsentModal from "./ConsentModal.svelte";

  let { nightMode = true, onnightmodechange, sfx, usageMonitoring = false, onusagemonitoringchange, autoFocus = true, onautofocuschange, onhooksremoved } = $props();

  let showConsent = $state(false);

  let sfxVolume = $state(0.5);

  $effect(() => {
    if (sfx) {
      sfxVolume = sfx.muted ? 0 : sfx.volume;
    }
  });

  let hooksInstalled = $state(null);
  let hooksBusy = $state(false);
  let hookResult = $state("");
  let confirmAction = $state(null);

  async function checkHookStatus() {
    try {
      const res = await fetch("/api/hooks/status");
      const data = await res.json();
      hooksInstalled = data.installed;
    } catch {
      hooksInstalled = null;
    }
  }

  function requestInstall() {
    confirmAction = "install";
  }

  function requestRemove() {
    confirmAction = "remove";
  }

  async function installHooks() {
    confirmAction = null;
    hooksBusy = true;
    hookResult = "";
    try {
      const res = await fetch("/api/hooks/install", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        hooksInstalled = true;
        hookResult = "installed";
      } else {
        hookResult = data.error || "Failed";
      }
    } catch {
      hookResult = "Could not reach server";
    } finally {
      hooksBusy = false;
    }
  }

  async function removeHooks() {
    confirmAction = null;
    hooksBusy = true;
    hookResult = "";
    try {
      const res = await fetch("/api/hooks/remove", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        hooksInstalled = false;
        hookResult = "removed";
        onhooksremoved?.();
      } else {
        hookResult = data.error || "Failed";
      }
    } catch {
      hookResult = "Could not reach server";
    } finally {
      hooksBusy = false;
    }
  }

  checkHookStatus();
</script>

<section>
  <h3>Preferences</h3>
  <ToggleSlider label="Night mode" checked={nightMode} onchange={onnightmodechange} />
  <ToggleSlider label="Auto focus" checked={autoFocus} onchange={onautofocuschange} />
  <label class="sfx-row">
    <span class="sfx-label">Notification sound</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={sfxVolume}
      oninput={(e) => {
        sfxVolume = +e.target.value;
      }}
      onchange={(e) => {
        sfxVolume = +e.target.value;
        const muted = sfxVolume === 0;
        const volume = sfxVolume || 0.01;
        sfx.volume = volume;
        sfx.muted = muted;
        fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sfx: { muted, volume } }),
        }).catch(() => {});
      }}
      onclick={() => {
        if (!sfx.muted) sfx.preview("pending");
      }}
    />
    <span class="sfx-value">{sfxVolume === 0 ? "Off" : `${Math.round(sfxVolume * 100)}%`}</span>
  </label>
</section>

<section>
  <h3>Claude Code Connection</h3>
  <ToggleSlider
    label="Usage monitoring"
    checked={usageMonitoring}
    onchange={(v) => {
      if (v) {
        showConsent = true;
      } else {
        onusagemonitoringchange?.(false);
      }
    }}
  />
  <div class="hooks-row">
    <div class="hooks-status">
      {#if hooksInstalled === null}
        <span class="status-dot unknown"></span>
        <span class="status-label">Checking…</span>
      {:else if hooksInstalled}
        <span class="status-dot installed"></span>
        <span class="status-label">Hooks installed</span>
      {:else}
        <span class="status-dot missing"></span>
        <span class="status-label">Hooks not installed</span>
      {/if}
    </div>
    <div class="hook-actions">
      <button class="hook-btn" onclick={requestInstall} disabled={hooksBusy}>
        {hooksBusy ? "Working…" : "Reinstall hooks"}
      </button>
      {#if hooksInstalled}
        <button class="hook-btn danger" onclick={requestRemove} disabled={hooksBusy}>
          Remove hooks
        </button>
      {/if}
    </div>
  </div>
  {#if hookResult === "installed"}
    <p class="hook-msg success">Hooks installed. Restart Claude Code sessions to pick up changes.</p>
  {:else if hookResult === "removed"}
    <p class="hook-msg success">Hooks removed. Claude Code sessions will no longer report to Claudia.</p>
  {:else if hookResult}
    <p class="hook-msg error">{hookResult}</p>
  {/if}
</section>

{#if showConsent}
  <ConsentModal onchoice={(v) => {
    showConsent = false;
    if (v) onusagemonitoringchange?.(true);
  }} />
{/if}

<footer class="about">
  <a href="https://github.com/RockyHong/Claudia" target="_blank" rel="noopener noreferrer">Built with Claude · <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.31-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6.02 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.62-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3"/></svg> GitHub</a>
</footer>

{#if confirmAction === "install"}
  <ConfirmDialog
    message="This will install Claudia hooks into <code>~/.claude/settings.json</code>. Existing hooks are preserved."
    confirmLabel="Install hooks"
    variant="neutral"
    onconfirm={installHooks}
    oncancel={() => confirmAction = null}
  />
{:else if confirmAction === "remove"}
  <ConfirmDialog
    message="Remove all Claudia hooks from <code>~/.claude/settings.json</code>? Your other hooks will not be touched."
    confirmLabel="Remove hooks"
    onconfirm={removeHooks}
    oncancel={() => confirmAction = null}
  />
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  section h3 {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 0;
  }

  .sfx-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }

  section :global(.toggle-label),
  .sfx-label {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .sfx-row input[type="range"] {
    flex: 1;
    accent-color: var(--brand);
    height: 4px;
  }

  .sfx-value {
    font-size: var(--text-xs);
    color: var(--text-muted);
    min-width: 32px;
    text-align: right;
  }

  .hooks-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hooks-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.installed { background: var(--green); }
  .status-dot.missing { background: var(--red); }
  .status-dot.unknown { background: var(--gray); }

  .status-label {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .hook-actions {
    display: flex;
    gap: var(--space-2);
  }

  .hook-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .hook-btn:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .hook-btn.danger:hover:not(:disabled) {
    color: var(--red);
    border-color: var(--red);
  }

  .hook-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hook-msg {
    font-size: var(--text-xs);
    margin-top: var(--space-2);
  }

  .hook-msg.success { color: var(--green); }
  .hook-msg.error { color: var(--red); }

  .about {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-faint);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .about a {
    color: var(--text-faint);
    text-decoration: none;
    transition: color var(--duration-normal);
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .about a:hover {
    color: var(--text-muted);
  }
</style>
