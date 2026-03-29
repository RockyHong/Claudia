<script>
  let { checked = false, label = "", onchange } = $props();
</script>

<label class="toggle">
  <span class="toggle-label">{label}</span>
  <button
    class="toggle-track"
    class:on={checked}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onclick={() => onchange?.(!checked)}
  >
    <span class="toggle-thumb"></span>
  </button>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .toggle-label {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .toggle-track {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--border);
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-track.on {
    background: var(--brand);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-track.on .toggle-thumb {
    transform: translateX(18px);
  }
</style>
