<script>
  let { aggregateState = "idle" } = $props();

  const STATES = ["idle", "busy", "pending"];

  let available = $state(null);
  let videoA = $state(null);
  let videoB = $state(null);
  let srcA = $state("");
  let srcB = $state("");
  let showA = $state(true);
  let locked = $state(false);

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

  let targetSrc = $derived.by(() => {
    if (!available || !available[aggregateState]) return null;
    const formats = available[aggregateState];
    if (formats.webm) return `/avatar/${aggregateState}.webm`;
    if (formats.mp4) return `/avatar/${aggregateState}.mp4`;
    return null;
  });

  $effect(() => {
    if (!targetSrc || locked) return;
    const currentSrc = showA ? srcA : srcB;
    if (targetSrc === currentSrc) return;

    if (!currentSrc && !srcA && !srcB) {
      srcA = targetSrc;
      showA = true;
      return;
    }

    // Load into the hidden slot
    if (showA) {
      srcB = targetSrc;
    } else {
      srcA = targetSrc;
    }
  });

  function handleCanPlay(slot) {
    const incomingSlot = showA ? "B" : "A";
    if (slot !== incomingSlot || locked) return;

    const el = slot === "A" ? videoA : videoB;
    el.play().catch(() => {});

    locked = true;
    showA = !showA;

    setTimeout(() => {
      locked = false;
    }, 350);
  }
</script>

{#if srcA || srcB}
  <div class="avatar-panel">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoA}
      src={srcA || undefined}
      class="slot"
      class:visible={showA}
      oncanplay={() => handleCanPlay("A")}
      autoplay={showA}
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
      oncanplay={() => handleCanPlay("B")}
      autoplay={!showA}
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
    display: block;
    width: 100%;
    height: auto;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .slot:first-child {
    position: relative;
  }

  .slot:last-child {
    position: absolute;
    top: 0;
    left: 0;
  }

  .slot.visible {
    opacity: 1;
  }
</style>
