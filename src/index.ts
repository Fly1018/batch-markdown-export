import { Plugin, showMessage, fetchSyncPost, saveExportFile } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { SettingUtils } from "@/libs/setting-utils";
import MigrationDialog from "@/components/MigrationDialog.svelte";
import "./index.scss";

const NOTEBOOK_API = "/api/notebook/lsNotebooks";
const SQL_API = "/api/query/sql";
const EXPORT_API = "/api/export/exportNotebooksMd";
const IMPORT_API = "/api/import/importZipMd";
const IMPORT_STD_MD_API = "/api/import/importStdMd";
const RELOAD_FILETREE_API = "/api/ui/reloadFiletree";

interface NotebookRow {
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
}

const DEFAULT_QUICK: QuickSettings = {
    exportNotebook: "",
    exportSaveMode: "dialog",
    importFolder: "",
    importNotebook: "",
    importPath: "/",
    importSkipRoot: false,
};

const OPTIONS = [
    { key: "includeSubDocs", label: "optionIncludeSubDocs", desc: "optionIncludeSubDocsDesc" },
    { key: "addTitle", label: "optionAddTitle", desc: "optionAddTitleDesc" },
    { key: "markdownYFM", label: "optionMarkdownYFM", desc: "optionMarkdownYFMDesc" },
    { key: "removeAssetsID", label: "optionRemoveAssetsID", desc: "optionRemoveAssetsIDDesc" },
];

export default class BatchMarkdownExport extends Plugin {
    private settingUtils: SettingUtils;
    private disposed = false;
    private exporting = false;
    private saving = false;
    private importing = false;
    private quick: QuickSettings = { ...DEFAULT_QUICK };
    private dialog: ReturnType<typeof svelteDialog> | undefined;

    async onload() {
        this.disposed = false;
        this.settingUtils = new SettingUtils({ plugin: this, name: "settings" });
        for (const option of OPTIONS) {
            const key = option.key;
            this.settingUtils.addItem({
                key,
                value: true,
                type: "checkbox",
                title: this.t(option.label),
                description: this.t(option.desc),
                direction: "row",
                action: {
                    callback: () => {
                        void this.settingUtils.takeAndSave(key);
                    },
                },
            });
        }
        try {
            await this.settingUtils.load();
        } catch (error) {
            console.warn("[batch-markdown-export] load settings failed", error);
        }

        await this.loadQuick();
        this.addCommand({
            langKey: "quickExport",
            hotkey: "⇧⌘E",
            callback: () => void this.quickExport(),
        });
        this.addCommand({
            langKey: "quickImport",
            hotkey: "⇧⌘I",
            callback: () => void this.quickImport(),
        });
    }

    onLayoutReady() {
        if (this.disposed) return;
        (this.addTopBar as any)({
            icon: "iconDownload",
            title: this.t("topBarTitle"),
            position: "right",
            callback: () => this.openMigrationDialog("export"),
            contextMenu: (menu: any) => {
                menu.addItem({
                    icon: "iconDownload",
                    label: this.t("exportMenu"),
                    click: () => this.openMigrationDialog("export"),
                });
                menu.addItem({
                    icon: "iconUpload",
                    label: this.t("importMenu"),
                    click: () => this.openMigrationDialog("import"),
                });
                menu.addSeparator();
                menu.addItem({
                    icon: "iconSparkles",
                    label: this.t("quickExport"),
                    click: () => void this.quickExport(),
                });
                menu.addItem({
                    icon: "iconDownload",
                    label: this.t("quickImport"),
                    click: () => void this.quickImport(),
                });
                menu.addItem({
                    icon: "iconSettings",
                    label: this.t("quickConfigMenu"),
                    click: () => this.openMigrationDialog("quick"),
                });
                menu.addSeparator();
                menu.addItem({
                    icon: "iconSettings",
                    label: this.t("settingsMenu"),
                    click: () => this.openSettings(),
                });
            },
        });
    }

    onunload() {
        this.disposed = true;
        this.dialog?.close();
        this.dialog = undefined;
    }

    private t(key: string): string {
        const value = (this.i18n as Record<string, unknown>)[key];
        return typeof value === "string" && value ? value : key;
    }

    private openSettings() {
        if (this.disposed || !this.settingUtils) return;
        try {
            this.setting.open(this.displayName || this.name);
        } catch (error) {
            showMessage(this.t("settingsFailed"), 6000, "error");
        }
    }

    private settingsPayload() {
        return {
            includeSubDocs: Boolean(this.settingUtils.get("includeSubDocs")),
            addTitle: Boolean(this.settingUtils.get("addTitle")),
            markdownYFM: Boolean(this.settingUtils.get("markdownYFM")),
            removeAssetsID: Boolean(this.settingUtils.get("removeAssetsID")),
        };
    }

    private async post(url: string, payload: Record<string, unknown>) {
        const response = await fetchSyncPost(url, payload);
        if (!response || typeof response.code !== "number") {
            throw new Error(this.t("requestFailed"));
        }
        if (response.code !== 0) {
            throw new Error(response.msg || this.t("requestFailed"));
        }
        return response;
    }

    private async loadNotebooks(): Promise<{ notebooks: NotebookRow[]; counts: Record<string, number> }> {
        const response = await this.post(NOTEBOOK_API, {});
        const data = response.data as any;
        if (!data || !Array.isArray(data.notebooks)) {
            throw new Error(response.msg || this.t("requestFailed"));
        }
        const notebooks: NotebookRow[] = data.notebooks
            .filter((notebook: any) => notebook && typeof notebook.id === "string" && notebook.id)
            .map((notebook: any) => ({
                id: notebook.id,
                name: typeof notebook.name === "string" && notebook.name ? notebook.name : this.t("nameUnknown"),
                closed: Boolean(notebook.closed),
                encrypted: Boolean(notebook.encrypted),
                count: null,
            }));
        let counts: Record<string, number> = {};
        try {
            const rows = await this.post(SQL_API, {
                stmt: "SELECT box, COUNT(1) AS doc_count FROM blocks WHERE type = 'd' GROUP BY box",
            });
            if (Array.isArray(rows.data)) {
                for (const row of rows.data as any[]) {
                    const count = Number(row?.doc_count);
                    if (row?.box && Number.isFinite(count)) counts[row.box] = count;
                }
            }
        } catch (error) {
            console.warn("[batch-markdown-export] count documents failed", error);
            counts = {};
        }
        return { notebooks, counts };
    }

    private async exportNotebooks(ids: string[]): Promise<{ zip: string; name: string }> {
        const payload = { notebooks: ids, ...this.settingsPayload() };
        const response = await this.post(EXPORT_API, payload);
        const data = response.data as any;
        const zip = data && typeof data.zip === "string" ? data.zip : "";
        if (!zip) throw new Error(this.t("emptyResult"));
        return { zip, name: data?.name || "export.zip" };
    }

    private async saveZip(zip: string, name: string): Promise<"saved" | "canceled" | "error"> {
        try {
            if (typeof saveExportFile === "function") {
                const result = (await saveExportFile(zip)) as any;
                if (!result) {
                    this.downloadViaAnchor(zip, name);
                    return "saved";
                }
                if (result.status === "canceled") return "canceled";
                if (result.status === "error") return "error";
                return "saved";
            }
            this.downloadViaAnchor(zip, name);
            return "saved";
        } catch (error) {
            console.warn("[batch-markdown-export] save export file failed", error);
            this.downloadViaAnchor(zip, name);
            return "saved";
        }
    }

    private downloadViaAnchor(zip: string, name: string) {
        try {
            const anchor = document.createElement("a");
            anchor.href = zip;
            anchor.download = name || "export.zip";
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch (error) {
            console.error("[batch-markdown-export] trigger download failed", error);
            showMessage(this.t("downloadFailed"), 7000, "error");
        }
    }

    private async importZip(file: File, notebook: string, toPath: string, skipRoot: boolean) {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("notebook", notebook);
        form.append("toPath", toPath || "/");
        if (skipRoot) form.append("skipRoot", "true");

        let response: Response;
        try {
            response = await fetch(IMPORT_API, { method: "POST", body: form });
        } catch (error) {
            throw new Error(this.t("importFailed"));
        }

        let data: any = null;
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }
        if (!data || typeof data.code !== "number" || data.code !== 0) {
            throw new Error((data && data.msg) || this.t("importFailed"));
        }

        try {
            await fetchSyncPost(RELOAD_FILETREE_API, {});
        } catch (error) {
            console.warn("[batch-markdown-export] reload file tree failed", error);
        }
    }

    private normalizeQuick(raw: any): QuickSettings {
        const result: QuickSettings = { ...DEFAULT_QUICK };
        if (!raw || typeof raw !== "object") return result;
        for (const key of ["exportNotebook", "importFolder", "importNotebook", "importPath"] as const) {
            if (typeof raw[key] === "string") result[key] = raw[key];
        }
        if (raw.exportSaveMode === "download") result.exportSaveMode = "download";
        if (typeof raw.importSkipRoot === "boolean") result.importSkipRoot = raw.importSkipRoot;
        if (!result.importPath) result.importPath = "/";
        return result;
    }

    private async loadQuick() {
        try {
            const stored = await this.loadData("quick");
            this.quick = this.normalizeQuick(stored);
        } catch (error) {
            console.warn("[batch-markdown-export] load quick settings failed", error);
        }
    }

    private saveQuick() {
        try {
            const request = this.saveData("quick", { ...this.quick });
            if (request && typeof request.catch === "function") request.catch(() => undefined);
        } catch (error) {
            console.warn("[batch-markdown-export] save quick settings failed", error);
        }
    }

    private async quickExport() {
        if (this.disposed) return;
        if (this.exporting || this.saving || this.importing) {
            showMessage(this.t("exporting"), 3000);
            return;
        }
        const notebook = this.quick.exportNotebook;
        if (!notebook) {
            showMessage(this.t("quickNotConfiguredExport"), 5000);
            this.openMigrationDialog("quick");
            return;
        }
        this.exporting = true;
        try {
            const result = await this.exportNotebooks([notebook]);
            if (this.quick.exportSaveMode === "download") {
                this.downloadViaAnchor(result.zip, result.name);
                showMessage(this.t("quickExportDownloaded"), 4000);
            } else {
                this.saving = true;
                try {
                    const status = await this.saveZip(result.zip, result.name);
                    if (status === "saved") showMessage(this.t("exportSaved"), 4000);
                    else if (status === "canceled") showMessage(this.t("exportCanceled"), 4000);
                    else showMessage(this.t("downloadFailed"), 7000, "error");
                } finally {
                    this.saving = false;
                }
            }
        } catch (error: any) {
            showMessage(`${this.t("exportFailed")}: ${error?.message || this.t("requestFailed")}`, 6000, "error");
        } finally {
            this.exporting = false;
        }
    }

    private async quickImport() {
        if (this.disposed) return;
        if (this.importing) {
            showMessage(this.t("importing"), 3000);
            return;
        }
        const folder = String(this.quick.importFolder || "").trim();
        const notebook = String(this.quick.importNotebook || "").trim();
        if (!folder || !notebook) {
            showMessage(this.t("quickNotConfiguredImport"), 5000);
            this.openMigrationDialog("quick");
            return;
        }
        this.importing = true;
        try {
            const response = await fetchSyncPost(IMPORT_STD_MD_API, {
                notebook,
                localPath: folder,
                toPath: String(this.quick.importPath || "/").trim() || "/",
                skipRoot: Boolean(this.quick.importSkipRoot),
            });
            if (!response || typeof response.code !== "number") {
                throw new Error(this.t("importFailed"));
            }
            if (response.code !== 0) {
                throw new Error(response.msg || this.t("importFailed"));
            }
            try {
                await fetchSyncPost(RELOAD_FILETREE_API, {});
            } catch (error) {
                console.warn("[batch-markdown-export] reload file tree failed", error);
            }
            showMessage(this.t("importDone"), 4000);
        } catch (error: any) {
            showMessage(`${this.t("importFailed")}: ${error?.message || this.t("requestFailed")}`, 7000, "error");
        } finally {
            this.importing = false;
        }
    }

    private openMigrationDialog(tab: "export" | "import" | "quick" = "export") {
        if (this.disposed) return;
        if (this.exporting || this.saving || this.importing) {
            showMessage(this.t(tab === "import" ? "importing" : "exporting"), 3000);
            return;
        }
        if (this.dialog) return;

        let handle: ReturnType<typeof svelteDialog>;
        handle = svelteDialog({
            title: this.t("migrationTitle"),
            component: MigrationDialog,
            width: "560px",
            height: "640px",
            props: {
                initialTab: tab,
                labels: {
                    hint: this.t("dialogHint"),
                    loading: this.t("loading"),
                    requestFailed: this.t("requestFailed"),
                    nameUnknown: this.t("nameUnknown"),
                    encryptedTag: this.t("encryptedTag"),
                    closedTag: this.t("closedTag"),
                    docsUnknown: this.t("docsUnknown"),
                    selectAll: this.t("selectAll"),
                    selectNone: this.t("selectNone"),
                    summary: this.t("summary"),
                    noSelection: this.t("noSelection"),
                    cancel: this.t("cancel"),
                    export: this.t("export"),
                    exporting: this.t("exporting"),
                    exportDone: this.t("exportDone"),
                    exportSaved: this.t("exportSaved"),
                    exportCanceled: this.t("exportCanceled"),
                    exportFailed: this.t("exportFailed"),
                    downloadFailed: this.t("downloadFailed"),
                    downloadAgain: this.t("downloadAgain"),
                    emptyNotebooks: this.t("emptyNotebooks"),
                    tabExport: this.t("tabExport"),
                    tabImport: this.t("tabImport"),
                    importHint: this.t("importHint"),
                    importNotebook: this.t("importNotebook"),
                    importPath: this.t("importPath"),
                    importPathPlaceholder: this.t("importPathPlaceholder"),
                    importPathHint: this.t("importPathHint"),
                    importFile: this.t("importFile"),
                    importChooseFile: this.t("importChooseFile"),
                    importFileInfo: this.t("importFileInfo"),
                    importNoFile: this.t("importNoFile"),
                    importOnlyZip: this.t("importOnlyZip"),
                    importSkipRoot: this.t("importSkipRoot"),
                    importSkipRootDesc: this.t("importSkipRootDesc"),
                    importStart: this.t("importStart"),
                    importing: this.t("importing"),
                    importDone: this.t("importDone"),
                    importFailed: this.t("importFailed"),
                    importNeedNotebook: this.t("importNeedNotebook"),
                    importNoNotebooks: this.t("importNoNotebooks"),
                    tabQuick: this.t("tabQuick"),
                    quickIntro: this.t("quickIntro"),
                    quickExportSection: this.t("quickExportSection"),
                    quickExportNotebook: this.t("quickExportNotebook"),
                    quickSaveMode: this.t("quickSaveMode"),
                    quickSaveDialog: this.t("quickSaveDialog"),
                    quickSaveDownload: this.t("quickSaveDownload"),
                    quickExportHint: this.t("quickExportHint"),
                    quickSaveModeHint: this.t("quickSaveModeHint"),
                    quickImportSection: this.t("quickImportSection"),
                    quickImportFolder: this.t("quickImportFolder"),
                    quickImportFolderPlaceholder: this.t("quickImportFolderPlaceholder"),
                    quickImportFolderHint: this.t("quickImportFolderHint"),
                    quickImportNotebook: this.t("quickImportNotebook"),
                    quickImportPath: this.t("quickImportPath"),
                    quickImportPathHint: this.t("quickImportPathHint"),
                    quickImportSkipRoot: this.t("quickImportSkipRoot"),
                    quickImportSkipRootDesc: this.t("quickImportSkipRootDesc"),
                    quickHotkeyHint: this.t("quickHotkeyHint"),
                    quickSaved: this.t("quickSaved"),
                    save: this.t("save"),
                },
                load: () => this.loadNotebooks(),
                exportNotebooks: async (ids: string[]) => {
                    this.exporting = true;
                    try {
                        return await this.exportNotebooks(ids);
                    } finally {
                        this.exporting = false;
                    }
                },
                save: async (zip: string, name: string) => {
                    this.saving = true;
                    try {
                        const result = await this.saveZip(zip, name);
                        if (result === "saved") showMessage(this.t("exportSaved"), 4000);
                        if (result === "canceled") showMessage(this.t("exportCanceled"), 4000);
                        if (result === "error") showMessage(this.t("downloadFailed"), 7000, "error");
                        return result;
                    } finally {
                        this.saving = false;
                    }
                },
                importZip: async (file: File, notebook: string, toPath: string, skipRoot: boolean) => {
                    this.importing = true;
                    try {
                        await this.importZip(file, notebook, toPath, skipRoot);
                    } finally {
                        this.importing = false;
                    }
                },
                quickSettings: { ...this.quick },
                onQuickSave: (next: QuickSettings) => {
                    this.quick = this.normalizeQuick(next);
                    this.saveQuick();
                    showMessage(this.t("quickSaved"), 3000);
                },
                onClose: () => handle.close(),
            },
            callback: () => {
                if (this.dialog === handle) this.dialog = undefined;
            },
        });
        this.dialog = handle;
    }
}
