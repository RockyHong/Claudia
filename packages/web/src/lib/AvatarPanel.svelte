<script>
  let { aggregateState = "idle" } = $props();

  const STATES = ["idle", "working", "pending", "thinking"];

  let available = $state(null);

  $effect(() => {
    checkAvailability();
  });

  async function checkAvailability() {
    const results = {};
    for (const state of STATES) {
      const webm = await probe(`/avatar/${state}.webm`);
      const mp4 = await probe(`/avatar/${state}.mp4`);
      if (webm || mp4) {
        results[state] = { webm, mp4 };
      }
    }
    available = Object.keys(results).length > 0 ? results : null;
  }

  async function probe(url) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

  let videoSrc = $derived.by(() => {
    if (!available || !available[aggregateState]) return null;
    const formats = available[aggregateState];
    if (formats.webm) return `/avatar/${aggregateState}.webm`;
    if (formats.mp4) return `/avatar/${aggregateState}.mp4`;
    return null;
  });
</script>

{#if videoSrc}
  <div class="avatar-panel">
    <!-- svelte-ignore a11y_media_has_caption -->
    {#key videoSrc}
      <video
        src={videoSrc}
        autoplay
        loop
        muted
        playsinline
      ></video>
    {/key}
  </div>
{/if}

<style>
  .avatar-panel {
    padding: 16px 16px 0;
    overflow: hidden;
    border-radius: 12px;
    margin: 0 12px;
  }

  video {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 12px;
  }
</style>
