<script>
import { Maximize2 } from "lucide-svelte";
import Tooltip from "./Tooltip.svelte";

let {
	aggregateState = "idle",
	background = false,
	version = 0,
	onavatarclick,
	onimmersive,
} = $props();

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
		probe(`/avatar/${state}.webm${bust}`).then((ok) => ({
			state,
			fmt: "webm",
			ok,
		})),
		probe(`/avatar/${state}.mp4${bust}`).then((ok) => ({
			state,
			fmt: "mp4",
			ok,
		})),
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
		const src = results[state].webm
			? `/avatar/${state}.webm${bust}`
			: `/avatar/${state}.mp4${bust}`;
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
  <div
    class="avatar-panel"
    class:bg-mode={background}
    class:hoverable={!background && onimmersive}
    style:aspect-ratio={background ? undefined : aspectRatio}
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

    {#if !background && onimmersive}
      <span class="expand-wrap">
        <Tooltip text="Enter immersive mode">
          <button
            class="expand-btn"
            onclick={() => onimmersive()}
            aria-label="Immersive mode"
          >
            <Maximize2 />
          </button>
        </Tooltip>
      </span>
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
    image-rendering: pixelated;
  }

  .bg-mode .slot {
    border-radius: 0;
    object-fit: cover;
  }

  .slot.visible {
    opacity: 1;
  }

  .expand-wrap {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
  }

  .expand-btn {
    position: relative;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    opacity: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expand-btn :global(svg) {
    width: 20px;
    height: 20px;
    color: #fff;
    filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.4));
  }

  .expand-btn:hover {
    background: rgba(0, 0, 0, 0.7);
  }

</style>
