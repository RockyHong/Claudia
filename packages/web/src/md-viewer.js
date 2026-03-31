import { mount } from "svelte";
import MdViewer from "./md-viewer/MdViewer.svelte";

const params = new URLSearchParams(window.location.search);
const cwd = params.get("cwd") || "";

mount(MdViewer, {
	target: document.getElementById("app"),
	props: { cwd },
});
