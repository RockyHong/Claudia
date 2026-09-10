<script>
import ConfirmDialog from "./ConfirmDialog.svelte";

let isStale = $state(false);
let dismissed = $state(false);
let confirming = $state(false);
let updating = $state(false);
let updated = $state(false);
let error = $state("");

async function checkHookStatus() {
	try {
		const res = await fetch("/api/hooks/status");
		const data = await res.json();
		isStale = data.installed === true && data.stale === true;
	} catch {
		isStale = false;
	}
}

async function updateHooks() {
	confirming = false;
	updating = true;
	error = "";
	try {
		const res = await fetch("/api/hooks/install", { method: "POST" });
		const data = await res.json();
		if (data.success) {
			await checkHookStatus();
			if (isStale) {
				error = "Hooks still look out of date. Try Reinstall hooks in Settings.";
			} else {
				updated = true;
			}
		} else {
			error = data.error || "Could not update hooks";
		}
	} catch {
		error = "Could not reach server";
	} finally {
		updating = false;
	}
}

checkHookStatus();
</script>

{#if !dismissed && (isStale || updated)}
  <div class="hook-update" class:done={updated} role="status">
    <div class="hook-update-text">
      {#if updated}
        <p class="headline">Hooks updated.</p>
        <p class="detail">Claude Code sessions that are already running keep the old hooks — restart them to pick up the change.</p>
      {:else}
        <p class="headline">Claudia's hooks are out of date.</p>
        <p class="detail">Your sessions keep working on the old hooks. Updating keeps Claudia's session tracking accurate — already-running sessions pick it up after a restart.</p>
      {/if}
      {#if error}
        <p class="error">{error}</p>
      {/if}
    </div>
    <div class="hook-update-actions">
      {#if updated}
        <button class="act-btn ghost" onclick={() => dismissed = true}>Dismiss</button>
      {:else}
        <button class="act-btn ghost" onclick={() => dismissed = true} disabled={updating}>Not now</button>
        <button class="act-btn primary" onclick={() => confirming = true} disabled={updating}>
          {updating ? "Updating…" : "Update hooks"}
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if confirming}
  <ConfirmDialog
    message="This will rewrite Claudia's hooks in ~/.claude/settings.json to match this version. Your other hooks are preserved. Claude Code sessions that are already running keep the old hooks until you restart them."
    confirmLabel="Update hooks"
    variant="neutral"
    onconfirm={updateHooks}
    oncancel={() => confirming = false}
  />
{/if}

<style>
  .hook-update {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    background: rgba(229, 160, 58, 0.12);
    border: 1px solid rgba(229, 160, 58, 0.3);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .hook-update.done {
    background: rgba(74, 186, 106, 0.12);
    border-color: rgba(74, 186, 106, 0.3);
  }

  .hook-update-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1 1 220px;
  }

  .headline {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .detail {
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .error {
    font-size: var(--text-xs);
    color: var(--red);
  }

  .hook-update-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-left: auto;
  }

  .act-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .act-btn.ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .act-btn.ghost:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .act-btn.primary {
    background: var(--brand);
    color: #fff;
    border: none;
  }

  .act-btn.primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .act-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
