<script>
  import Modal from "./Modal.svelte";
  import ConfigTab from "./ConfigTab.svelte";

  let { onclose, nightMode = true, onnightmodechange } = $props();
</script>

<Modal title="Settings" {onclose}>
  <ConfigTab {nightMode} {onnightmodechange} />
</Modal>
