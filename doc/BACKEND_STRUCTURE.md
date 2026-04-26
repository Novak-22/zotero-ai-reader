# Backend Structure

## 模块划分

```
src/
├── modules/
│   ├── llm/
│   │   ├── providers/       # LLM Provider实现
│   │   │   ├── openai.ts
│   │   │   ├── claude.ts
│   │   │   ├── ollama.ts
│   │   │   └── generic.ts   # 国产/自定义API
│   │   ├── LLMService.ts    # Provider管理
│   │   └── types.ts         # LLM相关类型
│   ├── pdf/
│   │   ├── PDFService.ts    # PDF文本提取
│   │   └── ParagraphParser.ts # 段落分割
│   ├── summary/
│   │   └── SummaryService.ts # 分段总结生成
│   ├── chat/
│   │   ├── ChatService.ts   # 对话管理
│   │   └── ChatStorage.ts   # SQLite存储
│   └── ui/
│       ├── TOCPanel.ts      # 左侧目录UI
│       └── ChatPanel.ts     # 右侧对话UI
```

## LLM Provider接口

```typescript
interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], config: LLmConfig): Promise<string>;
  getCapabilities(): ProviderCapabilities;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LLmConfig {
  apiKey: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
```

## 对话上下文管理

```typescript
interface ChatSession {
  itemKey: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// 上下文累积策略
// 1. 保留最近N条消息
// 2. 或token数控制
// 3. 支持用户手动清空
```

## 数据库Schema

```sql
-- 对话历史表
CREATE TABLE chat_sessions (
  id INTEGER PRIMARY KEY,
  item_key TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  role TEXT,
  content TEXT,
  created_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- 目录缓存表
CREATE TABLE toc_cache (
  item_key TEXT PRIMARY KEY,
  toc_json TEXT,
  generated_at INTEGER
);

-- 用户配置表
CREATE TABLE api_configs (
  provider TEXT PRIMARY KEY,
  config_json TEXT
);
```

## 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| LLM API超时 | 重试3次，提示用户 |
| API密钥无效 | 提示用户检查配置 |
| PDF提取失败 | 显示错误，允许多次重试 |
| 网络错误 | 缓存策略，离线提示 |