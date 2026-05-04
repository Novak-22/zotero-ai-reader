import { getString, getLocaleID, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { llmService } from "./modules/llm/LLMService";
import { pdfService } from "./modules/pdf/PDFService";
import { chatService } from "./modules/chat/ChatService";
import type { LLMConfig } from "./modules/types";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  // Register reader pane sections
  registerReaderSections();

  // Register main window handlers
  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win))
  );

  addon.data.initialized = true;
}

function registerReaderSections(): void {
  // Left panel - AI TOC
  Zotero.ItemPaneManager.registerSection({
    paneID: "ai-reader-toc",
    pluginID: addon.data.config.addonID,
    header: {
      l10nArgs: `{"label": "AI 目录"}`,
    },
    sidenav: {
      l10nArgs: `{"label": "AI 目录", "icon": "chrome://zotero/skin/16/universal/book.svg"}`,
      icon: "chrome://zotero/skin/16/universal/book.svg",
    },
    bodyXHTML:
      '<html:div id="ai-toc-container" class="ai-panel-container"/>',
    onInit: ({ body, item }) => {
      ztoolkit.log("AI TOC section init", item?.id);
      if (item) {
        addon.data.reader!.currentItem = item;
        renderTOCPanel(body as HTMLElement, item);
      }
    },
    onItemChange: ({ item, setEnabled, tabType }) => {
      ztoolkit.log("AI TOC onItemChange", tabType, item?.id);
      setEnabled(tabType === "reader");
      if (item) {
        addon.data.reader!.currentItem = item;
        const container = document.getElementById("ai-toc-container") as HTMLElement;
        if (container) renderTOCPanel(container, item);
      }
      return true;
    },
  });

  // Right panel - AI Chat
  Zotero.ItemPaneManager.registerSection({
    paneID: "ai-reader-chat",
    pluginID: addon.data.config.addonID,
    header: {
      l10nArgs: `{"label": "AI 对话"}`,
    },
    sidenav: {
      l10nArgs: `{"label": "AI 对话", "icon": "chrome://zotero/skin/16/universal/chat.svg"}`,
      icon: "chrome://zotero/skin/16/universal/chat.svg",
    },
    bodyXHTML:
      '<html:div id="ai-chat-container" class="ai-panel-container"/>',
    onInit: async ({ body, item }) => {
      ztoolkit.log("AI Chat section init", item?.id);
      if (item) {
        const itemKey = `item_${item.id}`;
        await chatService.initSession(itemKey);
        renderChatUI(body as HTMLElement);
      }
    },
    onItemChange: async ({ item, setEnabled, tabType }) => {
      ztoolkit.log("AI Chat onItemChange", tabType, item?.id);
      setEnabled(tabType === "reader");
      if (item) {
        const itemKey = `item_${item.id}`;
        await chatService.initSession(itemKey);
        const container = document.getElementById("ai-chat-container") as HTMLElement;
        if (container) renderChatUI(container);
      }
      return true;
    },
    sectionButtons: [
      {
        type: "clear",
        icon: "chrome://zotero/skin/16/universal/empty-trash.svg",
        l10nArgs: `{"label": "清空"}`,
        onClick: async () => {
          await chatService.clearContext();
          const container = document.getElementById("ai-chat-container") as HTMLElement;
          if (container) renderChatUI(container);
        },
      },
    ],
  });
}

function renderTOCPanel(container: HTMLElement, item: Zotero.Item): void {
  container.innerHTML = `
    <div class="ai-toc-container">
      <div class="ai-toc-header">
        <span>AI 目录</span>
        <button class="ai-toc-refresh" id="toc-refresh-btn" title="Generate TOC">⟳</button>
      </div>
      <div class="ai-toc-list" id="toc-list">
        <div class="ai-toc-empty">点击按钮生成目录</div>
      </div>
    </div>
  `;

  const refreshBtn = document.getElementById("toc-refresh-btn");
  refreshBtn?.addEventListener("click", async () => {
    await generateTOC(container, item);
  });
}

async function generateTOC(container: HTMLElement, item: Zotero.Item): Promise<void> {
  const listEl = container.querySelector("#toc-list");
  if (listEl) listEl.innerHTML = '<div class="ai-toc-empty">生成中...</div>';

  const progressWindow = new ztoolkit.ProgressWindow("AI Reader", {
    closeOnClick: true,
  });

  try {
    progressWindow.createLine({
      text: "Extracting PDF text...",
      type: "default",
      progress: 20,
    });

    const attachments = await item.getAttachments();
    if (!attachments || attachments.length === 0) {
      throw new Error("No attachments found");
    }

    const attachmentIds = await Zotero.Items.get(attachments);
    const pdfAttachment = attachmentIds.find(
      (a: Zotero.Item) => a.attachmentContentType === "application/pdf"
    );
    if (!pdfAttachment) {
      throw new Error("No PDF attachment found");
    }

    progressWindow.changeLine({ progress: 40, text: "Parsing paragraphs..." });
    const text = await pdfService.extractText(pdfAttachment);
    const paragraphs = pdfService.parseParagraphs(text);

    progressWindow.changeLine({ progress: 60, text: "Generating TOC with AI..." });

    const config = getLLMConfig();
    const tocItems = await llmService.generateTOC(
      getDefaultProvider(),
      paragraphs.map((p) => p.text),
      config
    );

    addon.data.reader!.toc = tocItems;

    progressWindow.changeLine({ progress: 100, text: "TOC generated!" });
    progressWindow.startCloseTimer(2000);

    if (listEl) {
      if (tocItems.length === 0) {
        listEl.innerHTML = '<div class="ai-toc-empty">无法生成目录</div>';
      } else {
        listEl.innerHTML = tocItems
          .map(
            (item: any) => `
          <div class="ai-toc-item level-${item.level}" data-paragraph-index="${item.paragraphIndex}">
            <span class="ai-toc-icon">${item.level === 1 ? "📄" : "📃"}</span>
            <span class="ai-toc-title">${escapeHtml(item.title)}</span>
          </div>
        `
          )
          .join("");

        listEl.querySelectorAll(".ai-toc-item").forEach((el: Element) => {
          el.addEventListener("click", () => {
            const idx = el.getAttribute("data-paragraph-index");
            if (idx) scrollToParagraph(parseInt(idx));
          });
        });
      }
    }
  } catch (error) {
    ztoolkit.log("TOC generation error:", error);
    if (listEl) listEl.innerHTML = `<div class="ai-toc-empty">Error: ${error}</div>`;
  }
}

function renderChatUI(container: HTMLElement): void {
  const messages = chatService.getContext();

  container.innerHTML = `
    <div class="ai-chat-container">
      <div class="ai-chat-messages" id="chat-messages">
        ${
          messages.length === 0
            ? '<div class="ai-chat-empty">Select text in PDF and ask questions</div>'
            : messages
                .map(
                  (m) => `
            <div class="ai-chat-message ${m.role}">
              <div class="ai-chat-role">${m.role === "user" ? "You" : "AI"}</div>
              <div class="ai-chat-content">${escapeHtml(m.content)}</div>
            </div>
          `
                )
                .join("")
        }
      </div>
      <div class="ai-chat-input-area">
        <textarea id="chat-input" placeholder="Ask about selected text..." rows="2"></textarea>
        <button id="chat-send-btn">Send</button>
      </div>
    </div>
  `;

  const sendBtn = document.getElementById("chat-send-btn");
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;

  sendBtn?.addEventListener("click", async () => {
    const text = input?.value?.trim();
    if (!text) return;

    const selectedText = getSelectedPDFText();
    if (!selectedText) {
      alert("Please select text in the PDF first.");
      return;
    }

    const config = getLLMConfig();
    try {
      sendBtn.setAttribute("disabled", "true");
      input.value = "";
      await chatService.sendMessage(text, selectedText, getDefaultProvider(), config);
      const container = document.getElementById("ai-chat-container") as HTMLElement;
      if (container) renderChatUI(container);
    } catch (error) {
      ztoolkit.log("Chat error:", error);
      alert(`Error: ${error}`);
    } finally {
      sendBtn?.removeAttribute("disabled");
    }
  });
}

function getSelectedPDFText(): string {
  try {
    const readerWindow = (Zotero as any).getMainWindow?.()?.Zotero_Reader_Integration?.getReader?.();
    if (readerWindow?.contentWindow) {
      const selection = readerWindow.contentWindow.getSelection();
      return selection?.toString().trim() || "";
    }
  } catch {
    // Fallback
  }
  return "";
}

function getLLMConfig(): LLMConfig {
  const provider = getDefaultProvider();
  return {
    provider: provider as LLMConfig["provider"],
    apiKey: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.apiKey.${provider}`) as string,
    endpoint: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.endpoint.${provider}`) as string,
    model: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.model.${provider}`) as string,
    temperature: 0.7,
    maxTokens: 2048,
  };
}

function getDefaultProvider(): string {
  return (Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.defaultProvider`) as string) || "openai";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML as string;
}

function scrollToParagraph(index: number): void {
  const event = new CustomEvent("ai-reader-scroll-to-paragraph", {
    detail: { index },
  });
  (window as any).dispatchEvent(event);
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`
  );
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  delete (Zotero as any)[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any }
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      ztoolkit.log("Loading preference scripts");
      break;
    default:
      break;
  }
}

function onShortcuts(type: string) {
  ztoolkit.log("Shortcut:", type);
}

function onDialogEvents(type: string) {
  ztoolkit.log("Dialog event:", type);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};