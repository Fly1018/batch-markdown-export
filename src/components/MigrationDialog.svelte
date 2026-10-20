<script lang="ts">
    import { untrack } from "svelte";
    import NotebookDialog from "./NotebookDialog.svelte";
    import ImportPanel from "./ImportPanel.svelte";

    interface Props {
        labels: Record<string, string>;
        initialTab?: "export" | "import";
        load: () => Promise<{ notebooks: any[]; counts: Record<string, number> }>;
        exportNotebooks: (ids: string[]) => Promise<{ zip: string; name: string }>;
        save: (zip: string, name: string) => Promise<"saved" | "canceled" | "error">;
        importZip: (file: File, notebook: string, toPath: string, skipRoot: boolean) => Promise<void>;
        onClose: () => void;
    }

    let {
        labels,
        initialTab = "export",
        load,
        exportNotebooks,
        save,
        importZip,
        onClose,
    }: Props = $props();

    let tab = $state<"export" | "import">(untrack(() => initialTab));
</script>

<div class="migration">
    <div class="migration__tabs">
        <button
            type="button"
            class="migration__tab"
            class:migration__tab--active={tab === "export"}
            onclick={() => (tab = "export")}
        >
            {labels.tabExport}
        </button>
        <button
            type="button"
            class="migration__tab"
            class:migration__tab--active={tab === "import"}
            onclick={() => (tab = "import")}
        >
            {labels.tabImport}
        </button>
    </div>

    <div class="migration__body">
        {#if tab === "export"}
            <NotebookDialog {labels} {load} {exportNotebooks} {save} {onClose} />
        {:else}
            <ImportPanel {labels} {load} {importZip} {onClose} />
        {/if}
    </div>
</div>

<style>
    .migration {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
    }

    .migration__tabs {
        flex: none;
        display: flex;
        gap: 4px;
        padding: 8px 12px 0;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .migration__tab {
        padding: 5px 14px;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        cursor: pointer;
    }

    .migration__tab:hover {
        color: var(--b3-theme-primary);
    }

    .migration__tab--active {
        border-bottom-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    .migration__body {
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }
</style>
