<script>
import { onDestroy } from "svelte";

let { text = "", children } = $props();
let anchorEl = $state(null);

let bubble = null;

function show() {
	if (!text || !anchorEl || bubble) return;

	bubble = document.createElement("span");
	bubble.className = "tooltip-bubble";
	bubble.textContent = text;
	// Render off-screen to measure
	bubble.style.cssText = "position:fixed;visibility:hidden;top:0;left:0";
	document.body.appendChild(bubble);

	const ar = anchorEl.getBoundingClientRect();
	const br = bubble.getBoundingClientRect();
	const gap = 6;

	let top = ar.top - br.height - gap;
	let left = ar.left + ar.width / 2 - br.width / 2;

	if (top < 4) top = ar.bottom + gap;
	if (left < 4) left = 4;
	if (left + br.width > window.innerWidth - 4)
		left = window.innerWidth - br.width - 4;

	bubble.style.cssText = `position:fixed;top:${top}px;left:${left}px`;
}

function hide() {
	if (bubble) {
		bubble.remove();
		bubble = null;
	}
}

onDestroy(hide);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="tooltip-anchor" bind:this={anchorEl} onmouseenter={show} onmouseleave={hide}>
  {@render children()}
</span>

<style>
  .tooltip-anchor {
    position: relative;
    display: inline-flex;
  }

  :global(.tooltip-bubble) {
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
