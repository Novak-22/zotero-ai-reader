# Tech Stack

## 核心技术

| 技术 | 用途 |
|------|------|
| TypeScript | 主开发语言 |
| Zotero Plugin Scaffold | 构建系统 |
| zotero-plugin-toolkit | UI组件、生命周期管理 |
| zotero-types | TypeScript类型定义 |

## 依赖

```json
{
  "dependencies": {
    "zotero-plugin-toolkit": "^5.1.0-beta.13"
  },
  "devDependencies": {
    "zotero-plugin-scaffold": "^0.8.2",
    "zotero-types": "^4.1.0-beta.4",
    "typescript": "^5.9.3"
  }
}
```

## 架构分层

```
┌─────────────────────────────────────┐
│  UI Layer (Reader Pane Sections)   │
│  - 左侧目录栏                        │
│  - 右侧对话栏                        │
├─────────────────────────────────────┤
│  Service Layer                       │
│  - LLMService (多Provider适配)       │
│  - PDFService (文本提取)             │
│  - SummaryService (分段总结)        │
├─────────────────────────────────────┤
│  Storage Layer                      │
│  - Zotero.DBConnection (SQLite)     │
│  - Zotero.Prefs (配置存储)           │
├─────────────────────────────────────┤
│  Zotero Core API                    │
│  - attachment.attachmentText        │
│  - Zotero.ItemPaneManager           │
└─────────────────────────────────────┘
```

## 关键API

### PDF文本提取
```typescript
const text = await attachment.attachmentText;
```

### Reader Pane注册
```typescript
Zotero.ItemPaneManager.registerSection({
  paneID: "ai-reader-toc",
  pluginID: addon.data.config.addonID,
  bodyXHTML: '...',
  onAsyncRender: async ({ body, item }) => { ... }
});
```

### 对话存储
```typescript
const db = new Zotero.DBConnection('ai-reader');
db.query('INSERT INTO chat_history ...');
```