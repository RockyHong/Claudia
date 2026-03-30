<script>
  let { text = "", children } = $props();
</script>

<span class="tooltip-anchor">
  {@render children()}
  {#if text}
    <span class="tooltip-bubble">{text}</span>
  {/if}
</span>

<style>
  .tooltip-anchor {
    position: relative;
    display: inline-flex;
  }

  .tooltip-bubble {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    white-space: pre-line;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-out),
                transform var(--duration-normal) var(--ease-out);
  }

  .tooltip-anchor:hover .tooltip-bubble {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
</style>
