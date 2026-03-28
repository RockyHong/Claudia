<script>
  import ToggleSlider from "./ToggleSlider.svelte";

  let { nightMode = true, onnightmodechange, sfx } = $props();

  let sfxVolume = $state(0.5);

  $effect(() => {
    if (sfx) {
      sfxVolume = sfx.muted ? 0 : sfx.volume;
    }
  });

  let hooksInstalled = $state(null);
  let reinstalling = $state(false);
  let reinstallResult = $state("");

  async function checkHookStatus() {
    try {
      const res = await fetch("/api/hooks/status");
      const data = await res.json();
      hooksInstalled = data.installed;
    } catch {
      hooksInstalled = null;
    }
  }

  async function reinstallHooks() {
    reinstalling = true;
    reinstallResult = "";
    try {
      const res = await fetch("/api/hooks/install", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        hooksInstalled = true;
        reinstallResult = "success";
      } else {
        reinstallResult = data.error || "Failed";
      }
    } catch {
      reinstallResult = "Could not reach server";
    } finally {
      reinstalling = false;
    }
  }

  checkHookStatus();
</script>

<section>
  <h3>Appearance</h3>
  <ToggleSlider label="Night mode" checked={nightMode} onchange={onnightmodechange} />
</section>

<section>
  <h3>Sound Effects</h3>
  <div class="sfx-controls">
    <label class="sfx-volume">
      <span>{sfxVolume === 0 ? "Off" : `${Math.round(sfxVolume * 100)}%`}</span>
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
          sfx.volume = sfxVolume || 0.01;
          sfx.muted = sfxVolume === 0;
          if (sfxVolume > 0) sfx.preview("pending");
        }}
      />
    </label>
  </div>
</section>

<section>
  <h3>Hooks</h3>
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
  <button class="reinstall-btn" onclick={reinstallHooks} disabled={reinstalling}>
    {reinstalling ? "Installing…" : "Reinstall Hooks"}
  </button>
  {#if reinstallResult === "success"}
    <p class="reinstall-msg success">Hooks updated. Restart Claude Code sessions to pick up changes.</p>
  {:else if reinstallResult}
    <p class="reinstall-msg error">{reinstallResult}</p>
  {/if}
</section>

<style>
  section h3 {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .sfx-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sfx-volume {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .sfx-volume span {
    min-width: 32px;
    text-align: right;
  }

  .sfx-volume input[type="range"] {
    flex: 1;
    accent-color: var(--brand);
    height: 4px;
  }

  .hooks-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.installed { background: var(--green); }
  .status-dot.missing { background: var(--red); }
  .status-dot.unknown { background: var(--gray); }

  .status-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  .reinstall-btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .reinstall-btn:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .reinstall-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .reinstall-msg {
    font-size: 12px;
    margin-top: 8px;
  }

  .reinstall-msg.success { color: var(--green); }
  .reinstall-msg.error { color: var(--red); }
</style>
