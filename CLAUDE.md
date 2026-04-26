# CLAUDE.md

Review `lessons.md` at session start for relevant project patterns.

## Project Context

This is a Zotero plugin project for AI-assisted PDF reading. Key contexts:
- TypeScript + Zotero Plugin Scaffold
- Uses `zotero-plugin-toolkit` for UI components
- PDF reader integration via `Zotero.ItemPaneManager.registerSection()`
- SQLite via `Zotero.DBConnection` for data persistence

## Working with this Project

- Run `npm start` for development with hot reload
- Run `npm run build` for production build
- Changes to plugin code require Zotero restart with `-purgecaches` flag
- Use `Zotero.ItemPaneManager.registerSection()` for PDF reader UI injection
- Use `attachment.attachmentText` for PDF text extraction

## Commands

```bash
npm start     # Development mode
npm run build  # Production build
```

## Key Paths

- Plugin entry: `addon/bootstrap.js`
- TypeScript source: `src/`
- UI templates: `addon/content/`
- Documentation: `doc/`