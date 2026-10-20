import { Plugin, showMessage, fetchSyncPost, saveExportFile } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { SettingUtils } from "@/libs/setting-utils";
import MigrationDialog from "@/components/MigrationDialog.svelte";
import "./index.scss";

const NOTEBOOK_API = "/api/notebook/lsNotebooks";
const SQL_API = "/api/query/sql";
const EXPORT_API = "/api/export/exportNotebooksMd";
const IMPORT_API = "/api/import/importZipMd";
const RELOAD_FILETREE_API = "/api/ui/reloadFiletree";

interface NotebookRow {
    id: string;
    name: string;
    closed: boolean;
    encrypted: boolean;
    count: number | null;
}

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

    private openMigrationDialog(tab: "export" | "import" = "export") {
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
                onClose: () => handle.close(),
            },
            callback: () => {
                if (this.dialog === handle) this.dialog = undefined;
            },
        });
        this.dialog = handle;
    }
}
