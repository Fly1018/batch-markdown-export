<script lang="ts">
    import { onMount } from "svelte";

    interface Notebook {
        id: string;
        name: string;
        closed: boolean;
        encrypted: boolean;
        count: number | null;
    }

    interface Props {
        labels: Record<string, string>;
        load: () => Promise<{ notebooks: Notebook[]; counts: Record<string, number> }>;
        exportNotebooks: (ids: string[]) => Promise<{ zip: string; name: string }>;
        save: (zip: string, name: string) => Promise<"saved" | "canceled" | "error">;
        onClose: () => void;
    }

    let { labels, load, exportNotebooks, save, onClose }: Props = $props();

    let notebooks = $state<Notebook[]>([]);
    let selected = $state<string[]>([]);
    let loading = $state(true);
    let busy = $state(false);
    let status = $state("");
    let statusKind = $state<"" | "muted" | "error" | "success">("");
    let lastZip = $state("");
    let lastName = $state("");

    const canSelect = $derived(notebooks.filter((notebook) => !notebook.encrypted));
    const selectedNotebooks = $derived(
        notebooks.filter((notebook) => !notebook.encrypted && selected.includes(notebook.id)),
    );
    const summaryText = $derived.by(() => {
        const known = selectedNotebooks.filter((notebook) => typeof notebook.count === "number");
        const total = known.reduce((sum, notebook) => sum + (notebook.count || 0), 0);
        let docs = "0";
        if (selectedNotebooks.length > 0) {
            if (known.length !== selectedNotebooks.length) {
                docs = total > 0 ? `${total}+` : labels.docsUnknown;
            } else {
                docs = String(total);
            }
        }
        return labels.summary.replace("${notebooks}", String(selectedNotebooks.length)).replace("${docs}", docs);
    });

    onMount(async () => {
        try {
            const result = await load();
            notebooks = result.notebooks.map((notebook) => ({
                ...notebook,
                count: Object.prototype.hasOwnProperty.call(result.counts, notebook.id)
                    ? result.counts[notebook.id]
                    : null,
            }));
            selected = notebooks.filter((notebook) => !notebook.encrypted).map((notebook) => notebook.id);
        } catch (error: any) {
            statusKind = "error";
            status = error?.message || labels.requestFailed;
        } finally {
            loading = false;
        }
    });

    function isSelected(id: string): boolean {
        return selected.includes(id);
    }

    function toggle(id: string) {
        if (busy) return;
        selected = isSelected(id) ? selected.filter((item) => item !== id) : [...selected, id];
    }

    function selectAll() {
        if (busy) return;
        selected = canSelect.map((notebook) => notebook.id);
    }

    function selectNone() {
        if (busy) return;
        selected = [];
    }

    async function runExport() {
        if (busy || loading) return;
        const ids = selectedNotebooks.map((notebook) => notebook.id);
        if (!ids.length) {
            statusKind = "error";
            status = labels.noSelection;
            return;
        }
        busy = true;
        statusKind = "muted";
        status = labels.exporting;
        try {
            const result = await exportNotebooks(ids);
            lastZip = result.zip;
            lastName = result.name;
            statusKind = "success";
            status = labels.exportDone;
            await saveLast();
        } catch (error: any) {
            statusKind = "error";
            status = `${labels.exportFailed}: ${error?.message || labels.requestFailed}`;
        } finally {
            busy = false;
        }
    }

    async function saveLast() {
        if (!lastZip) return;
        const result = await save(lastZip, lastName);
        if (result === "saved") {
            statusKind = "success";
            status = labels.exportSaved;
        } else if (result === "canceled") {
            statusKind = "muted";
            status = labels.exportCanceled;
        } else {
            statusKind = "error";
            status = labels.downloadFailed;
        }
    }

    async function downloadAgain() {
        if (busy || !lastZip) return;
        busy = true;
        try {
            await saveLast();
        } finally {
            busy = false;
        }
    }
</script>

<div class="batch-md-export-dialog">
    <div class="batch-md-export-dialog__hint">{labels.hint}</div>

    <div class="batch-md-export-dialog__list">
        {#if loading}
            <div class="batch-md-export-dialog__empty">{labels.loading}</div>
        {:else if notebooks.length === 0}
            <div class="batch-md-export-dialog__empty">{labels.emptyNotebooks}</div>
        {:else}
            {#each notebooks as notebook (notebook.id)}
                <label
                    class="batch-md-export-dialog__notebook"
                    class:batch-md-export-dialog__notebook--disabled={notebook.encrypted}
                >
                    <input
                        type="checkbox"
                        class="batch-md-export-dialog__checkbox"
                        checked={isSelected(notebook.id)}
                        disabled={busy || notebook.encrypted}
                        onchange={() => toggle(notebook.id)}
                    />
                    <span class="batch-md-export-dialog__name" title={notebook.name}>{notebook.name}</span>
                    {#if notebook.encrypted || notebook.closed}
                        <span class="batch-md-export-dialog__tag">
                            {notebook.encrypted ? labels.encryptedTag : labels.closedTag}
                        </span>
                    {/if}
                    <span class="batch-md-export-dialog__meta">
                        {notebook.count === null ? labels.docsUnknown : String(notebook.count)}
                    </span>
                </label>
            {/each}
        {/if}
    </div>

    <div class="batch-md-export-dialog__selection">
        <button type="button" class="b3-button b3-button--outline" onclick={selectAll} disabled={busy || loading}>
            {labels.selectAll}
        </button>
        <button type="button" class="b3-button b3-button--outline" onclick={selectNone} disabled={busy || loading}>
            {labels.selectNone}
        </button>
        <div class="batch-md-export-dialog__summary">{summaryText}</div>
    </div>

    <div class="batch-md-export-dialog__status" class:batch-md-export-dialog__status--error={statusKind === "error"} class:batch-md-export-dialog__status--success={statusKind === "success"} class:batch-md-export-dialog__status--muted={statusKind === "muted"}>
        {status}
    </div>

    <div class="batch-md-export-dialog__action">
        <button type="button" class="b3-button b3-button--cancel" onclick={() => onClose()} disabled={busy}>
            {labels.cancel}
        </button>
        {#if lastZip}
            <button type="button" class="b3-button b3-button--outline" onclick={downloadAgain} disabled={busy}>
                {labels.downloadAgain}
            </button>
        {/if}
        <button
            type="button"
            class="b3-button b3-button--text"
            onclick={runExport}
            disabled={busy || loading || selectedNotebooks.length === 0}
        >
            {busy ? labels.exporting : labels.export}
        </button>
    </div>
</div>

<style>
    .batch-md-export-dialog {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        padding: 14px 16px;
    }

    .batch-md-export-dialog__hint {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.6;
    }

    .batch-md-export-dialog__list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 4px 8px;
    }

    .batch-md-export-dialog__notebook {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 4px;
        border-bottom: 1px dashed var(--b3-border-color);
        cursor: pointer;
    }

    .batch-md-export-dialog__notebook:last-child {
        border-bottom: 0;
    }

    .batch-md-export-dialog__notebook--disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .batch-md-export-dialog__name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .batch-md-export-dialog__tag {
        flex: none;
        padding: 1px 6px;
        border-radius: 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 11px;
    }

    .batch-md-export-dialog__meta {
        flex: none;
        min-width: 36px;
        text-align: right;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .batch-md-export-dialog__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .batch-md-export-dialog__selection {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .batch-md-export-dialog__summary {
        margin-left: auto;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .batch-md-export-dialog__status {
        min-height: 20px;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        white-space: pre-wrap;
    }

    .batch-md-export-dialog__status--error {
        color: var(--b3-theme-error);
    }

    .batch-md-export-dialog__status--success {
        color: var(--b3-theme-primary);
    }

    .batch-md-export-dialog__status--muted {
        opacity: 0.8;
    }

    .batch-md-export-dialog__action {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: auto;
    }
</style>
