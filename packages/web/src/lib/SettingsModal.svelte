<script>
  import Modal from "./Modal.svelte";
  import ConfigTab from "./ConfigTab.svelte";

  let { onclose, sfx, nightMode = true, onnightmodechange, usageMonitoring = false, onusagemonitoringchange } = $props();
</script>

<Modal title="Settings" {onclose}>
  <ConfigTab {nightMode} {onnightmodechange} {sfx} {usageMonitoring} {onusagemonitoringchange} />
</Modal>
