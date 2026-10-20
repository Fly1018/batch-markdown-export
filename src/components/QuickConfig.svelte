<script lang="ts">
    import { onMount, untrack } from "svelte";

    interface Notebook {
        id: string;
        name: string;
        closed: boolean;
        encrypted: boolean;
        count: number | null;
    }

    interface QuickSettings {
        exportNotebook: string;
        exportSaveMode: "dialog" | "download";
        importFolder: string;
        importNotebook: string;
        importPath: string;
        importSkipRoot: boolean;
        stripYaml: boolean;
        stripTitle: boolean;
    }

    interface Props {
        labels: Record<string, string>;
        settings: QuickSettings;
        loadNotebooks: () => Promise<{ notebooks: Notebook[]; counts: Record<string, number> }>;
        onSave: (settings: QuickSettings) => void;
        onCancel: () => void;
    }

    let { labels, settings, loadNotebooks, onSave, onCancel }: Props = $props();
    const initial = untrack(() => ({ ...settings }));

    let notebooks = $state<Notebook[]>([]);
    let loading = $state(true);
    let saved = $state(false);
    let error = $state("");
    let exportNotebook = $state(initial.exportNotebook);
    let exportSaveMode = $state<"dialog" | "download">(initial.exportSaveMode);
    let importFolder = $state(initial.importFolder);
    let importNotebook = $state(initial.importNotebook);
    let importPath = $state(initial.importPath || "/");
    let importSkipRoot = $state(initial.importSkipRoot);
    let stripYaml = $state(initial.stripYaml);
    let stripTitle = $state(initial.stripTitle);

    const exportOptions = $derived(notebooks.filter((notebook) => !notebook.encrypted));
    const importOptions = $derived(notebooks.filter((notebook) => !notebook.encrypted && !notebook.closed));

    onMount(async () => {
        try {
            const result = await loadNotebooks();
            notebooks = result.notebooks;
            if (!exportOptions.some((notebook) => notebook.id === exportNotebook)) {
                exportNotebook = exportOptions[0]?.id || "";
            }
            if (!importOptions.some((notebook) => notebook.id === importNotebook)) {
                importNotebook = importOptions[0]?.id || "";
            }
        } catch (e: any) {
            error = e?.message || labels.requestFailed;
        } finally {
            loading = false;
        }
    });

    function save() {
        onSave({
            exportNotebook,
            exportSaveMode,
            importFolder: importFolder.trim(),
            importNotebook,
            importPath: importPath.trim() || "/",
            importSkipRoot,
            stripYaml,
            stripTitle,
        });
        saved = true;
        error = "";
    }
</script>

<div class="quick">
    <div class="quick__hint">{labels.quickIntro}</div>

    {#if loading}
        <div class="quick__empty">{labels.loading}</div>
    {:else}
        <section class="quick__section">
            <div class="quick__title">{labels.quickExportSection}</div>
            <label class="quick__field">
                <span>{labels.quickExportNotebook}</span>
                <select class="b3-select" bind:value={exportNotebook}>
                    {#each exportOptions as notebook (notebook.id)}
                        <option value={notebook.id}>
                            {notebook.name}{notebook.count === null ? "" : ` (${notebook.count})`}
                        </option>
                    {/each}
                </select>
            </label>
            <label class="quick__field">
                <span>{labels.quickSaveMode}</span>
                <select class="b3-select" bind:value={exportSaveMode}>
                    <option value="dialog">{labels.quickSaveDialog}</option>
                    <option value="download">{labels.quickSaveDownload}</option>
                </select>
            </label>
            <div class="quick__hint quick__hint--small">{labels.quickExportHint}</div>
            <div class="quick__hint quick__hint--small">{labels.quickSaveModeHint}</div>
        </section>

        <section class="quick__section">
            <div class="quick__title">{labels.quickImportSection}</div>
            <label class="quick__field">
                <span>{labels.quickImportFolder}</span>
                <input
                    class="b3-text-field"
                    bind:value={importFolder}
                    placeholder={labels.quickImportFolderPlaceholder}
                />
            </label>
            <div class="quick__hint quick__hint--small">{labels.quickImportFolderHint}</div>

            <label class="quick__field">
                <span>{labels.quickImportNotebook}</span>
                <select class="b3-select" bind:value={importNotebook}>
                    {#each importOptions as notebook (notebook.id)}
                        <option value={notebook.id}>{notebook.name}</option>
                    {/each}
                </select>
            </label>
            <label class="quick__field">
                <span>{labels.quickImportPath}</span>
                <input class="b3-text-field" bind:value={importPath} placeholder="/" />
            </label>
            <div class="quick__hint quick__hint--small">{labels.quickImportPathHint}</div>

            <label class="quick__check">
                <input type="checkbox" class="b3-switch" bind:checked={stripYaml} />
                <span>{labels.importStripYaml}</span>
            </label>
            <label class="quick__check">
                <input type="checkbox" class="b3-switch" bind:checked={stripTitle} />
                <span>{labels.importStripTitle}</span>
            </label>
            <div class="quick__hint quick__hint--small">{labels.importStripHint}</div>

            <label class="quick__check">
                <input type="checkbox" class="b3-switch" bind:checked={importSkipRoot} />
                <span>{labels.quickImportSkipRoot}</span>
            </label>
            <div class="quick__hint quick__hint--small">{labels.quickImportSkipRootDesc}</div>
        </section>

        {#if error}
            <div class="quick__error">{error}</div>
        {/if}
        <div class="quick__hint quick__hint--small">{labels.quickHotkeyHint}</div>
    {/if}

    <div class="quick__actions">
        <span class="quick__saved">{saved ? labels.quickSaved : ""}</span>
        <button type="button" class="b3-button b3-button--cancel" onclick={onCancel}>{labels.cancel}</button>
        <button type="button" class="b3-button b3-button--text" onclick={save} disabled={loading}>
            {labels.save}
        </button>
    </div>
</div>

<style>
    .quick {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        padding: 14px 16px;
        overflow: auto;
    }

    .quick__hint {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.6;
    }

    .quick__hint--small {
        margin-top: -4px;
        font-size: 11px;
        opacity: 0.8;
    }

    .quick__section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .quick__section:last-of-type {
        border-bottom: 0;
    }

    .quick__title {
        color: var(--b3-theme-primary);
        font-size: 13px;
        font-weight: 600;
    }

    .quick__field {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .quick__field span {
        flex: none;
        width: 96px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .quick__field select,
    .quick__field input {
        flex: 1;
        min-width: 0;
    }

    .quick__check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
    }

    .quick__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .quick__error {
        color: var(--b3-theme-error);
        font-size: 12px;
    }

    .quick__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: auto;
        padding-top: 10px;
    }

    .quick__saved {
        flex: 1;
        color: var(--b3-theme-primary);
        font-size: 12px;
    }
</style>
