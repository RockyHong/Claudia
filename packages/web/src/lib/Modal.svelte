<script>
  let { title, onclose, children } = $props();

  function handleKeydown(e) {
    if (e.key === "Escape") onclose();
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={() => {}} role="dialog" aria-modal="true" aria-label={title}>
  <div class="modal">
    <div class="modal-header">
      <h2>{title}</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 8, 7, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    font-family: var(--font-body);
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-heading);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 var(--space-1);
    line-height: 1;
    transition: color var(--duration-normal);
  }

  .close-btn:hover {
    color: var(--text);
  }

  .modal-body {
    padding: var(--space-5);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
</style>
