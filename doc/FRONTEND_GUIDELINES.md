# Frontend Guidelines

## UI架构

使用Zotero ItemPaneManager注册ReaderPaneSection，每个section包含：
- `header`: 标题栏
- `sidenav`: 侧边导航图标
- `bodyXHTML`: 主体内容（嵌入browser元素）

## 目录栏(Left Panel)

### 结构
```html
<div class="toc-container">
  <div class="toc-header">AI目录</div>
  <div class="toc-list">
    <!-- 动态生成的目录项 -->
  </div>
</div>
```

### 目录项
```html
<div class="toc-item" data-page="3">
  <span class="toc-icon">📄</span>
  <span class="toc-title">1. 引言</span>
</div>
```

### 交互
- 点击目录项：滚动PDF到对应页面
- 目录生成中：显示loading状态
- 无目录时：显示提示"点击生成目录"

## 对话栏(Right Panel)

### 结构
```html
<div class="chat-container">
  <div class="chat-header">AI 对话</div>
  <div class="chat-messages">
    <!-- 对话消息列表 -->
  </div>
  <div class="chat-input-area">
    <textarea placeholder="选中文字后输入问题..."></textarea>
    <button send>发送</button>
  </div>
</div>
```

### 消息样式
```css
.message { margin: 8px 0; padding: 8px; border-radius: 8px; }
.message.user { background: #e3f2fd; align-self: flex-end; }
.message.ai { background: #f5f5f5; align-self: flex-start; }
```

## 样式规范

- 使用CSS Variables管理主题颜色
- 适配Zotero深色/浅色主题
- 最小宽度：250px
- 最大宽度：400px

## 性能考虑

- 目录按需加载，不一次生成所有
- 对话消息虚拟滚动（大量历史时）
- 防抖处理用户输入