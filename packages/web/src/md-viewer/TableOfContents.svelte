<script>
import { onMount } from "svelte";

let { headings = [] } = $props();

let activeId = $state("");

onMount(() => {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					activeId = entry.target.id;
				}
			}
		},
		{ rootMargin: "-80px 0px -60% 0px" },
	);

	function observe() {
		observer.disconnect();
		for (const h of headings) {
			const el = document.getElementById(h.id);
			if (el) observer.observe(el);
		}
	}

	$effect(() => {
		if (headings.length > 0) observe();
	});

	return () => observer.disconnect();
});

function scrollTo(id) {
	const el = document.getElementById(id);
	if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<nav class="toc" aria-label="Table of contents">
  <div class="toc-title">On this page</div>
  {#each headings as heading}
    <button
      class="toc-item"
      class:active={activeId === heading.id}
      style="padding-left: {12 + (heading.level - 1) * 12}px"
      onclick={() => scrollTo(heading.id)}
    >
      {heading.text}
    </button>
  {/each}
</nav>

<style>
  .toc {
    padding: 16px 0;
    overflow-y: auto;
    font-size: 0.8125rem;
  }

  .toc-title {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--viewer-text-faint);
    padding: 0 16px 12px;
  }

  .toc-item {
    all: unset;
    display: block;
    width: 100%;
    padding: 5px 16px;
    color: var(--viewer-text-muted);
    cursor: pointer;
    box-sizing: border-box;
    transition: color 150ms ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toc-item:hover {
    color: var(--viewer-text);
  }

  .toc-item.active {
    color: var(--viewer-text);
    border-left: 2px solid var(--viewer-accent);
  }
</style>
