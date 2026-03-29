<script>
  import Modal from "./Modal.svelte";
  import ConfigTab from "./ConfigTab.svelte";

  let { onclose, sfx, nightMode = true, onnightmodechange } = $props();
</script>

<Modal title="Settings" {onclose}>
  <ConfigTab {nightMode} {onnightmodechange} {sfx} />
</Modal>
