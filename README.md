# Batch Markdown Export & Import

Export notebooks as a Markdown ZIP, or import a Markdown ZIP into a notebook, from one top-bar panel.

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

## Usage

1. Click the download icon in the top bar.
2. Switch between the **Export** and **Import** tabs.
3. Export: select notebooks and click **Export**.
4. Import: choose a notebook, a target path, and a `.zip` file, then click **Start import**.

Right-click the top-bar icon to open the export or import tab directly.

## Notes

- Import only lists non-encrypted notebooks.
- The import ZIP can contain `.md` files and folders; folders are imported as documents.
- If the ZIP contains a single top-level folder, enable **Skip the ZIP root folder** to avoid creating an extra document level.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```
