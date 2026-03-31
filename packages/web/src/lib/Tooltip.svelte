<script>
  let { text = "", children } = $props();
  let anchorEl = $state(null);
  let bubbleEl = $state(null);
  let pos = $state({ top: 0, left: 0 });
  let hovering = $state(false);

  function reposition() {
    if (!anchorEl || !bubbleEl) return;
    const ar = anchorEl.getBoundingClientRect();
    const br = bubbleEl.getBoundingClientRect();
    const gap = 6;

    // Center above anchor, then clamp to viewport
    let top = ar.top - br.height - gap;
    let left = ar.left + ar.width / 2 - br.width / 2;

    // If overflows top, show below instead
    if (top < 4) top = ar.bottom + gap;
    // Clamp horizontal
    if (left < 4) left = 4;
    if (left + br.width > window.innerWidth - 4) left = window.innerWidth - br.width - 4;

    pos = { top, left };
  }

  function onenter() {
    hovering = true;
    // Wait one tick for bubble to render, then position
    requestAnimationFrame(reposition);
  }

  function onleave() {
    hovering = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="tooltip-anchor" bind:this={anchorEl} onmouseenter={onenter} onmouseleave={onleave}>
  {@render children()}
  {#if text && hovering}
    <span
      class="tooltip-bubble"
      bind:this={bubbleEl}
      style="top:{pos.top}px;left:{pos.left}px"
    >{text}</span>
  {/if}
</span>

<style>
  .tooltip-anchor {
    position: relative;
    display: inline-flex;
  }

  .tooltip-bubble {
    position: fixed;
    white-space: pre-line;
    width: max-content;
    max-width: min(300px, 90vw);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    pointer-events: none;
    z-index: 9999;
  }
</style>
