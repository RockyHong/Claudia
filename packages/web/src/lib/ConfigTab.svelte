<script>
  import ToggleSlider from "./ToggleSlider.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import ConsentModal from "./ConsentModal.svelte";

  let { nightMode = true, onnightmodechange, sfx, usageMonitoring = false, onusagemonitoringchange, onhooksremoved } = $props();

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
  <label class="sfx-row">
    <span class="sfx-label">Sound</span>
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
        {hooksBusy ? "Working…" : "Reinstall"}
      </button>
      {#if hooksInstalled}
        <button class="hook-btn danger" onclick={requestRemove} disabled={hooksBusy}>
          Remove
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

{#if confirmAction === "install"}
  <ConfirmDialog
    message="This will install Claudia hooks into ~/.claude/settings.json. Existing hooks are preserved."
    confirmLabel="Install"
    variant="neutral"
    onconfirm={installHooks}
    oncancel={() => confirmAction = null}
  />
{:else if confirmAction === "remove"}
  <ConfirmDialog
    message="Remove all Claudia hooks from ~/.claude/settings.json? Your other hooks will not be touched."
    confirmLabel="Remove"
    onconfirm={removeHooks}
    oncancel={() => confirmAction = null}
  />
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  section h3 {
    font-size: 0.6875rem;
    font-weight: 500;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 0;
  }

  .sfx-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  section :global(.toggle-label),
  .sfx-label {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .sfx-row input[type="range"] {
    flex: 1;
    accent-color: var(--brand);
    height: 4px;
  }

  .sfx-value {
    font-size: 12px;
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
    gap: 8px;
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
    font-size: 0.6875rem;
    color: var(--text-faint);
  }

  .hook-actions {
    display: flex;
    gap: 8px;
  }

  .hook-btn {
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 400;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 14px;
    cursor: pointer;
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
    font-size: 12px;
    margin-top: 8px;
  }

  .hook-msg.success { color: var(--green); }
  .hook-msg.error { color: var(--red); }

</style>
