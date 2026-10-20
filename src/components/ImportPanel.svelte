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
        importZip: (file: File, notebook: string, toPath: string, skipRoot: boolean, stripYaml: boolean, stripTitle: boolean) => Promise<void>;
        onClose: () => void;
    }

    let { labels, load, importZip, onClose }: Props = $props();

    let notebooks = $state<Notebook[]>([]);
    let selectedNotebook = $state("");
    let loading = $state(true);
    let busy = $state(false);
    let status = $state("");
    let statusKind = $state<"" | "muted" | "error" | "success">("");
    let file = $state<File | null>(null);
    let toPath = $state("/");
    let skipRoot = $state(false);
    let stripYaml = $state(true);
    let stripTitle = $state(true);
    let fileInput: HTMLInputElement | undefined = $state();

    const available = $derived(notebooks.filter((notebook) => !notebook.encrypted));

    onMount(async () => {
        try {
            const result = await load();
            notebooks = result.notebooks.map((notebook) => ({
                ...notebook,
                count: Object.prototype.hasOwnProperty.call(result.counts, notebook.id)
                    ? result.counts[notebook.id]
                    : null,
            }));
            selectedNotebook = notebooks.find((notebook) => !notebook.encrypted)?.id || "";
        } catch (error: any) {
            statusKind = "error";
            status = error?.message || labels.requestFailed;
        } finally {
            loading = false;
        }
    });

    function formatSize(size: number): string {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }

    function onFileChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const picked = input.files && input.files[0] ? input.files[0] : null;
        if (!picked) {
            file = null;
            return;
        }
        if (!/\.zip$/i.test(picked.name)) {
            file = null;
            input.value = "";
            statusKind = "error";
            status = labels.importOnlyZip;
            return;
        }
        file = picked;
        statusKind = "";
        status = "";
    }

    function fileInfo(name: string, size: string): string {
        return labels.importFileInfo.replace("${name}", name).replace("${size}", size);
    }

    async function runImport() {
        if (busy || loading) return;
        if (!selectedNotebook) {
            statusKind = "error";
            status = labels.importNeedNotebook;
            return;
        }
        if (!file) {
            statusKind = "error";
            status = labels.importNoFile;
            return;
        }
        busy = true;
        statusKind = "muted";
        status = labels.importing;
        try {
            await importZip(file, selectedNotebook, toPath.trim() || "/", skipRoot, stripYaml, stripTitle);
            statusKind = "success";
            status = labels.importDone;
            file = null;
            if (fileInput) fileInput.value = "";
        } catch (error: any) {
            statusKind = "error";
            status = `${labels.importFailed}: ${error?.message || labels.requestFailed}`;
        } finally {
            busy = false;
        }
    }
</script>

<div class="imp">
    <div class="imp__hint">{labels.importHint}</div>

    {#if loading}
        <div class="imp__empty">{labels.loading}</div>
    {:else if available.length === 0}
        <div class="imp__empty">{labels.importNoNotebooks}</div>
    {:else}
        <label class="imp__field">
            <span class="imp__label">{labels.importNotebook}</span>
            <select class="b3-select" bind:value={selectedNotebook} disabled={busy}>
                {#each available as notebook (notebook.id)}
                    <option value={notebook.id}>
                        {notebook.name}{notebook.count === null ? "" : ` (${notebook.count})`}
                    </option>
                {/each}
            </select>
        </label>

        <label class="imp__field">
            <span class="imp__label">{labels.importPath}</span>
            <input
                class="b3-text-field"
                bind:value={toPath}
                placeholder={labels.importPathPlaceholder}
                disabled={busy}
            />
        </label>
        <div class="imp__hint imp__hint--small">{labels.importPathHint}</div>

        <div class="imp__file">
            <div class="imp__label">{labels.importFile}</div>
            <input
                bind:this={fileInput}
                class="b3-text-field imp__file-input"
                type="file"
                accept=".zip,application/zip"
                onchange={onFileChange}
                disabled={busy}
            />
            <div class="imp__file-info">
                {#if file}
                    {fileInfo(file.name, formatSize(file.size))}
                {:else}
                    {labels.importChooseFile}
                {/if}
            </div>
        </div>

        <label class="imp__check">
            <input type="checkbox" class="b3-switch" bind:checked={stripYaml} disabled={busy} />
            <span>{labels.importStripYaml}</span>
        </label>
        <label class="imp__check">
            <input type="checkbox" class="b3-switch" bind:checked={stripTitle} disabled={busy} />
            <span>{labels.importStripTitle}</span>
        </label>
        <div class="imp__hint imp__hint--small">{labels.importStripHint}</div>

        <label class="imp__check">
            <input type="checkbox" class="b3-switch" bind:checked={skipRoot} disabled={busy} />
            <span>{labels.importSkipRoot}</span>
        </label>
        <div class="imp__hint imp__hint--small">{labels.importSkipRootDesc}</div>
    {/if}

    <div
        class="imp__status"
        class:imp__status--error={statusKind === "error"}
        class:imp__status--success={statusKind === "success"}
        class:imp__status--muted={statusKind === "muted"}
    >
        {status}
    </div>

    <div class="imp__actions">
        <button type="button" class="b3-button b3-button--cancel" onclick={onClose} disabled={busy}>
            {labels.cancel}
        </button>
        <button
            type="button"
            class="b3-button b3-button--text"
            onclick={runImport}
            disabled={busy || loading || available.length === 0 || !file || !selectedNotebook}
        >
            {busy ? labels.importing : labels.importStart}
        </button>
    </div>
</div>

<style>
    .imp {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        padding: 14px 16px;
        overflow: auto;
    }

    .imp__hint {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.6;
    }

    .imp__hint--small {
        margin-top: -4px;
        font-size: 11px;
        opacity: 0.8;
    }

    .imp__field {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .imp__label {
        flex: none;
        width: 84px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .imp__field select,
    .imp__field input {
        flex: 1;
        min-width: 0;
    }

    .imp__file {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .imp__file-input {
        width: 100%;
        box-sizing: border-box;
    }

    .imp__file-info {
        color: var(--b3-theme-on-surface);
        font-size: 11px;
        word-break: break-all;
    }

    .imp__check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
    }

    .imp__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .imp__status {
        min-height: 20px;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        white-space: pre-wrap;
    }

    .imp__status--error {
        color: var(--b3-theme-error);
    }

    .imp__status--success {
        color: var(--b3-theme-primary);
    }

    .imp__status--muted {
        opacity: 0.8;
    }

    .imp__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: auto;
        padding-top: 10px;
    }
</style>
