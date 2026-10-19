import { Plugin, showMessage, fetchSyncPost, saveExportFile } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { SettingUtils } from "@/libs/setting-utils";
import NotebookDialog from "@/components/NotebookDialog.svelte";
import "./index.scss";

const NOTEBOOK_API = "/api/notebook/lsNotebooks";
const SQL_API = "/api/query/sql";
const EXPORT_API = "/api/export/exportNotebooksMd";

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
            callback: () => this.openExportDialog(),
            contextMenu: (menu: any) => {
                menu.addItem({
                    icon: "iconDownload",
                    label: this.t("exportMenu"),
                    click: () => this.openExportDialog(),
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

    private openExportDialog() {
        if (this.disposed) return;
        if (this.exporting || this.saving) {
            showMessage(this.t("exporting"), 3000);
            return;
        }
        if (this.dialog) return;

        let handle: ReturnType<typeof svelteDialog>;
        handle = svelteDialog({
            title: this.t("chooseNotebooks"),
            component: NotebookDialog,
            width: "520px",
            height: "560px",
            props: {
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
                onClose: () => handle.close(),
            },
            callback: () => {
                if (this.dialog === handle) this.dialog = undefined;
            },
        });
        this.dialog = handle;
    }
}
