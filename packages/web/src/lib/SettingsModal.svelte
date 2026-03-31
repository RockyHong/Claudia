<script>
import ConfigTab from "./ConfigTab.svelte";
import Modal from "./Modal.svelte";

let {
	onclose,
	sfx,
	nightMode = true,
	onnightmodechange,
	typingAmbience = false,
	ontypingambiencechange,
	usageMonitoring = false,
	onusagemonitoringchange,
	autoFocus = true,
	onautofocuschange,
	onhooksremoved,
} = $props();
</script>

<Modal title="Settings" {onclose}>
  <ConfigTab {nightMode} {onnightmodechange} {typingAmbience} {ontypingambiencechange} {sfx} {usageMonitoring} {onusagemonitoringchange} {autoFocus} {onautofocuschange} {onhooksremoved} />
</Modal>
