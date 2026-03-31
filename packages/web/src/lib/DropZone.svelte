<script>
  let { label, file = null, previewUrl = null, onfile } = $props();

  let dragging = $state(false);
  let inputEl;

  function handleDrop(e) {
    e.preventDefault();
    dragging = false;
    const dropped = e.dataTransfer?.files[0];
    if (dropped && isVideoFile(dropped)) onfile?.(dropped);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleFileInput(e) {
    const selected = e.target.files[0];
    if (selected) onfile?.(selected);
    e.target.value = "";
  }

  function isVideoFile(f) {
    return f.name.endsWith(".webm") || f.name.endsWith(".mp4");
  }

  function handleClick() {
    inputEl?.click();
  }

  let prevBlobUrl = null;

  let blobUrl = $derived.by(() => {
    if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
    const url = file ? URL.createObjectURL(file) : null;
    prevBlobUrl = url;
    return url;
  });

  let displayUrl = $derived(blobUrl || previewUrl);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dropzone"
  class:dragging
  class:filled={!!displayUrl}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  onclick={handleClick}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
  role="button"
  tabindex="0"
>
  <input
    bind:this={inputEl}
    type="file"
    accept=".webm,.mp4"
    onchange={handleFileInput}
    class="file-input"
  />

  {#if displayUrl}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      src={displayUrl}
      preload="auto"
      muted
      playsinline
      onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
      class="preview"
    ></video>
    <span class="replace-hint">Replace</span>
  {:else}
    <div class="empty">
      <span class="plus">+</span>
    </div>
  {/if}

  <span class="label-banner">{label}</span>
</div>

<style>
  .dropzone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    cursor: pointer;
    transition: border-color var(--duration-normal) var(--ease-in-out),
                background var(--duration-normal) var(--ease-in-out);
    aspect-ratio: 1;
    overflow: hidden;
  }

  .dropzone:hover,
  .dropzone.dragging {
    border-color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .dropzone.filled {
    border-style: solid;
    border-color: var(--border);
  }

  .dropzone.filled:hover {
    border-color: var(--brand);
  }

  .file-input {
    display: none;
  }

  .preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-xs);
    position: absolute;
    inset: 0;
  }

  .replace-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-md);
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-in-out);
  }

  .dropzone:hover .replace-hint {
    opacity: 1;
  }

  .empty {
    position: absolute;
    inset: 0 0 18px 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plus {
    font-size: 24px;
    color: var(--text-muted);
    line-height: 1;
  }

  .label-banner {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0.03em;
    padding: 2px 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 1;
  }
</style>
