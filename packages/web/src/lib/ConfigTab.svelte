<script>
  import ToggleSlider from "./ToggleSlider.svelte";

  let { nightMode = true, onnightmodechange, sfx } = $props();

  let sfxVolume = $state(0.5);

  $effect(() => {
    if (sfx) {
      sfxVolume = sfx.muted ? 0 : sfx.volume;
    }
  });
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
</style>
