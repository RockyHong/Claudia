<script>
  let { aggregateState = "idle", background = false, version = 0, onavatarclick } = $props();

  const STATES = ["idle", "busy", "pending"];

  let available = $state(null);
  let videoA = $state(null);
  let videoB = $state(null);
  let srcA = $state("");
  let srcB = $state("");
  let showA = $state(true);
  let cacheBust = $derived(version ? `?v=${version}` : "");

  $effect(() => {
    version;
    checkAvailability();
  });

  async function checkAvailability() {
    const bust = cacheBust;
    const probes = STATES.flatMap((state) => [
      probe(`/avatar/${state}.webm${bust}`).then((ok) => ({ state, fmt: "webm", ok })),
      probe(`/avatar/${state}.mp4${bust}`).then((ok) => ({ state, fmt: "mp4", ok })),
    ]);
    const results = {};
    const preloads = [];

    for (const { state, fmt, ok } of await Promise.all(probes)) {
      if (!ok) continue;
      if (!results[state]) results[state] = { webm: false, mp4: false };
      results[state][fmt] = true;
    }

    for (const state of STATES) {
      if (!results[state]) continue;
      const src = results[state].webm ? `/avatar/${state}.webm${bust}` : `/avatar/${state}.mp4${bust}`;
      preloads.push(preload(src));
    }

    await Promise.all(preloads);
    srcA = "";
    srcB = "";
    showA = true;
    aspectRatio = "";
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
    if (formats.webm) return `/avatar/${state}.webm${cacheBust}`;
    if (formats.mp4) return `/avatar/${state}.mp4${cacheBust}`;
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="avatar-panel"
    class:bg-mode={background}
    class:clickable={!background && onavatarclick}
    style:aspect-ratio={background ? undefined : aspectRatio}
    onclick={() => { if (!background && onavatarclick) onavatarclick(); }}
    onkeydown={(e) => { if (!background && onavatarclick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onavatarclick(); } }}
    role={!background && onavatarclick ? "button" : undefined}
    tabindex={!background && onavatarclick ? 0 : undefined}
  >
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

    {#if !background && onavatarclick}
      <div class="avatar-overlay">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 8h.01M3 16l5-5a2.5 2.5 0 0 1 3.5 0l5 5"/><path d="M14 14l1-1a2.5 2.5 0 0 1 3.5 0L21 16"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      </div>
    {/if}
  </div>
{/if}

<style>
  .avatar-panel {
    position: relative;
    margin: 32px 0 0;
    border-radius: 16px;
    overflow: hidden;
    background: var(--bg-card);
    border: 1px solid var(--border);
    max-height: 360px;
  }

  .avatar-panel.bg-mode {
    position: fixed;
    inset: 0;
    margin: 0;
    border-radius: 0;
    max-height: none;
    border: none;
    background: #000;
    z-index: 0;
  }

  .slot {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .bg-mode .slot {
    border-radius: 0;
    object-fit: cover;
  }

  .slot.visible {
    opacity: 1;
  }

  .clickable {
    cursor: pointer;
  }

  .avatar-overlay {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 1;
  }

  .avatar-overlay svg {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.8);
  }

  .clickable:hover .avatar-overlay {
    opacity: 1;
  }
</style>
