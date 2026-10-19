# Batch Markdown Export

Export one or more notebooks as a Markdown ZIP from a top-bar button.

## Usage

1. Click the download icon in the top bar.
2. Select the notebooks to export (encrypted notebooks are disabled).
3. Click **Export** and choose where to save the ZIP.
4. If you cancel the save dialog, use **Download again** in the export panel.

Right-click the top-bar icon to open the settings or start another export.

## Settings

- Include subdocuments
- Add document titles
- Add YAML front matter
- Strip asset IDs

Settings are stored in the plugin's private storage.

Rebuilt with Vite 8 + TypeScript + Svelte 5.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```
