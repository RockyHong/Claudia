<script>
  let { aggregateState = "idle" } = $props();

  const STATES = ["idle", "busy", "pending"];

  let available = $state(null);
  let videoA = $state(null);
  let videoB = $state(null);
  let srcA = $state("");
  let srcB = $state("");
  let showA = $state(true);

  $effect(() => {
    checkAvailability();
  });

  async function checkAvailability() {
    const results = {};
    const preloads = [];
    for (const state of STATES) {
      const webm = await probe(`/avatar/${state}.webm`);
      const mp4 = await probe(`/avatar/${state}.mp4`);
      if (webm || mp4) {
        results[state] = { webm, mp4 };
        const src = webm ? `/avatar/${state}.webm` : `/avatar/${state}.mp4`;
        preloads.push(preload(src));
      }
    }
    await Promise.all(preloads);
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

  function preload(src) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.src = src;
      video.oncanplaythrough = () => resolve();
      video.onerror = () => resolve();
    });
  }

  function getSrc(state) {
    if (!available || !available[state]) return null;
    const formats = available[state];
    if (formats.webm) return `/avatar/${state}.webm`;
    if (formats.mp4) return `/avatar/${state}.mp4`;
    return null;
  }

  let aspectRatio = $state("");

  function captureAspect(el) {
    if (!el || aspectRatio) return;
    const w = el.videoWidth;
    const h = el.videoHeight;
    if (w && h) aspectRatio = `${w} / ${h}`;
  }

  $effect(() => {
    const src = getSrc(aggregateState);
    if (!src) return;

    const currentSrc = showA ? srcA : srcB;
    if (src === currentSrc) return;

    // Load new source into the hidden slot and flip
    if (showA) {
      srcB = src;
      requestAnimationFrame(() => {
        videoB?.play().catch(() => {});
        captureAspect(videoB);
        showA = false;
      });
    } else {
      srcA = src;
      requestAnimationFrame(() => {
        videoA?.play().catch(() => {});
        captureAspect(videoA);
        showA = true;
      });
    }
  });
</script>

{#if available}
  <div class="avatar-panel" style:aspect-ratio={aspectRatio}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoA}
      src={srcA || undefined}
      class="slot"
      class:visible={showA}
      onloadedmetadata={() => captureAspect(videoA)}
      autoplay
      loop
      muted
      playsinline
    ></video>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoB}
      src={srcB || undefined}
      class="slot"
      class:visible={!showA}
      onloadedmetadata={() => captureAspect(videoB)}
      autoplay
      loop
      muted
      playsinline
    ></video>
  </div>
{/if}

<style>
  .avatar-panel {
    position: relative;
    margin: 16px 12px 0;
    border-radius: 12px;
    overflow: hidden;
  }

  .slot {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .slot.visible {
    opacity: 1;
  }
</style>
