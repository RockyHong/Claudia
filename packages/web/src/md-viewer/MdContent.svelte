<script>
  import { onMount, untrack } from "svelte";
  import "./hljs-theme.css";
  import { marked } from "marked";
  import hljs from "highlight.js/lib/core";
  import javascript from "highlight.js/lib/languages/javascript";
  import json from "highlight.js/lib/languages/json";
  import bash from "highlight.js/lib/languages/bash";
  import typescript from "highlight.js/lib/languages/typescript";
  import css from "highlight.js/lib/languages/css";
  import xml from "highlight.js/lib/languages/xml";
  import markdown from "highlight.js/lib/languages/markdown";
  import yaml from "highlight.js/lib/languages/yaml";

  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);

  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth }) {
    const id = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/(^-|-$)/g, "");
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  marked.use({ renderer });

  marked.setOptions({
    gfm: true,
    breaks: false,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return code;
    },
  });

  let {
    cwd = "",
    filePath = "",
    onHeadings = () => {},
  } = $props();

  let html = $state("");
  let lastMtime = $state(0);
  let loading = $state(false);
  let error = $state("");

  async function fetchContent() {
    if (!cwd || !filePath) return;
    try {
      loading = !html;
      const res = await fetch(`/api/md/file?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        error = res.status === 404 ? "File not found" : "Failed to load";
        return;
      }
      const data = await res.json();
      if (data.mtime === lastMtime) return;
      lastMtime = data.mtime;
      html = marked.parse(data.content);
      error = "";
      extractHeadings();
    } catch {
      error = "Failed to load file";
    } finally {
      loading = false;
    }
  }

  function extractHeadings() {
    requestAnimationFrame(() => {
      const el = document.querySelector(".md-body");
      if (!el) return;
      const headings = Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => ({
        id: h.id,
        text: h.textContent,
        level: parseInt(h.tagName[1]),
      }));
      onHeadings(headings);
    });
  }

  $effect(() => {
    if (filePath) {
      lastMtime = 0;
      html = "";
      untrack(() => fetchContent());
    }
  });

  onMount(() => {
    const interval = setInterval(() => {
      if (filePath) fetchContent();
    }, 3000);
    return () => clearInterval(interval);
  });
</script>

<article class="md-content">
  {#if loading}
    <div class="md-placeholder">Loading...</div>
  {:else if error}
    <div class="md-placeholder md-error">{error}</div>
  {:else if !filePath}
    <div class="md-placeholder">Select a file to view</div>
  {:else}
    <div class="md-body">
      {@html html}
    </div>
  {/if}
</article>

<style>
  .md-content {
    flex: 1;
    overflow-y: auto;
    padding: 32px 48px;
  }

  .md-body {
    max-width: 720px;
    margin: 0 auto;
    line-height: 1.8;
    font-family: var(--font-reading);
    color: var(--viewer-text);
  }

  .md-placeholder {
    color: var(--viewer-text-faint);
    text-align: center;
    padding-top: 120px;
    font-size: 14px;
  }

  .md-error {
    color: var(--viewer-red, #c43c3c);
  }

  .md-body :global(h1) {
    font-family: var(--font-heading);
    font-size: 1.8em;
    font-weight: 700;
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--viewer-border);
  }

  .md-body :global(h2) {
    font-family: var(--font-heading);
    font-size: 1.4em;
    font-weight: 600;
    margin: 32px 0 12px;
  }

  .md-body :global(h3) {
    font-family: var(--font-heading);
    font-size: 1.15em;
    font-weight: 600;
    margin: 24px 0 8px;
  }

  .md-body :global(h4), .md-body :global(h5), .md-body :global(h6) {
    font-family: var(--font-heading);
    font-weight: 600;
    margin: 20px 0 8px;
  }

  .md-body :global(p) {
    margin: 0 0 16px;
  }

  .md-body :global(a) {
    color: var(--viewer-link);
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 150ms ease;
  }

  .md-body :global(a:hover) {
    text-decoration-color: currentColor;
  }

  .md-body :global(code) {
    font-family: var(--font-mono);
    font-size: 0.875em;
    background: var(--viewer-code-bg);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .md-body :global(pre) {
    background: var(--viewer-code-bg);
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .md-body :global(pre code) {
    background: none;
    padding: 0;
    font-size: 13px;
  }

  .md-body :global(ul), .md-body :global(ol) {
    margin: 0 0 16px;
    padding-left: 24px;
  }

  .md-body :global(li) {
    margin-bottom: 4px;
  }

  .md-body :global(blockquote) {
    border-left: 3px solid var(--viewer-border);
    margin: 0 0 16px;
    padding: 4px 16px;
    color: var(--viewer-text-muted);
  }

  .md-body :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 16px;
    font-size: 14px;
  }

  .md-body :global(th), .md-body :global(td) {
    border: 1px solid var(--viewer-border);
    padding: 8px 12px;
    text-align: left;
  }

  .md-body :global(th) {
    font-weight: 600;
    background: var(--viewer-code-bg);
  }

  .md-body :global(hr) {
    border: none;
    border-top: 1px solid var(--viewer-border);
    margin: 32px 0;
  }

  .md-body :global(img) {
    max-width: 100%;
    border-radius: 6px;
  }

  .md-body :global(li input[type="checkbox"]) {
    margin-right: 6px;
  }
</style>
