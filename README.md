# Batch Markdown Export & Import

Export notebooks as a Markdown ZIP, import a Markdown ZIP, or run a preconfigured export/import with one hotkey.

## Features

### Export

- Select one or more notebooks and export them as a Markdown ZIP.
- Encrypted notebooks are disabled automatically.
- Save the ZIP through SiYuan's save dialog; if you cancel, use **Download again**.
- Options: include subdocuments, add document titles, add YAML front matter, strip asset IDs.

### Import

- Select a target notebook and an optional target path.
- Choose a Markdown ZIP (for example, one exported by this plugin).
- Optionally skip the ZIP root folder.
- Uploads through `/api/import/importZipMd` and refreshes the file tree afterwards.

### One-click export / import

Open the **Quick** tab once to configure:

- Default export notebook.
- Save mode: **Ask where to save** or **Download directly**.
- Default import folder (a local Markdown folder outside the workspace).
- Target notebook, target path, and whether to skip the folder root.

After that:

- `⇧⌘E` — export the configured notebook immediately.
- `⇧⌘I` — import the configured folder immediately.

The commands are also available in the command palette. Hotkeys can be changed in **Settings → Keymap**. If the quick settings are incomplete, the command opens the Quick tab and asks you to fill them in.

## Usage

1. Click the download icon in the top bar.
2. Use the **Export**, **Import**, or **Quick** tab.
3. Export: select notebooks and click **Export**.
4. Import: choose a notebook, a target path, and a `.zip` file, then click **Start import**.
5. Quick: fill in the defaults once, then use the hotkeys.

Right-click the top-bar icon to open the export/import tabs or run the one-click commands directly.

## Notes

- Import only lists non-encrypted notebooks; the one-click import requires an opened notebook.
- The import folder must be a local folder outside the SiYuan workspace.
- **Download directly** saves to the browser's default download folder without a save dialog.
- The import ZIP can contain `.md` files and folders; folders are imported as documents.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```
