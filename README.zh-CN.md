# 批量导出 Markdown

通过顶栏按钮把选中的笔记本导出为 Markdown ZIP。

## 使用

1. 点击顶栏下载图标。
2. 勾选要导出的笔记本（加密笔记本会自动禁用）。
3. 点击「导出」，选择 ZIP 保存位置。
4. 如果取消了保存对话框，可在面板中点击「重新下载」。

右键顶栏图标可打开设置或再次导出。

## 设置

- 包含子文档
- 添加文档标题
- 添加 YAML Front Matter
- 资源文件去掉 ID

设置保存在插件私有存储中。

使用 Vite 8 + TypeScript + Svelte 5 重建。

## 开发

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```
