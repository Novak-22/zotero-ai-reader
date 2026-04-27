import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { llmService } from "./modules/llm/LLMService";
import { pdfService } from "./modules/pdf/PDFService";
import { chatService } from "./modules/chat/ChatService";
import { tocPanel } from "./modules/ui/TOCPanel";
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
    label: getString("prefs-title"),
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
      l10nID: getLocaleID("ai-toc-header"),
      icon: "chrome://zotero/skin/16/universal/book.svg",
    },
    sidenav: {
      l10nID: getLocaleID("ai-toc-sidenav-tooltip"),
      icon: "chrome://zotero/skin/20/universal/book.svg",
    },
    bodyXHTML:
      '<html:div id="ai-toc-container" class="ai-panel-container"/>',
    onInit: ({ body }) => {
      tocPanel.init(addon.data.reader?.currentItem || null, body as HTMLElement);
    },
    onItemChange: ({ item, setEnabled, tabType }) => {
      setEnabled(tabType === "reader");
      if (item) {
        addon.data.reader!.currentItem = item;
        tocPanel.update(item);
      }
      return true;
    },
    onRender: ({ body }) => {
      ztoolkit.log("TOC section rendered");
    },
  });

  // Right panel - AI Chat
  Zotero.ItemPaneManager.registerSection({
    paneID: "ai-reader-chat",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("ai-chat-header"),
      icon: "chrome://zotero/skin/16/universal/chat.svg",
    },
    sidenav: {
      l10nID: getLocaleID("ai-chat-sidenav-tooltip"),
      icon: "chrome://zotero/skin/20/universal/chat.svg",
    },
    bodyXHTML:
      '<html:div id="ai-chat-container" class="ai-panel-container"/>',
    onInit: async ({ body, item }) => {
      if (item) {
        const itemKey = `item_${item.id}`;
        await chatService.initSession(itemKey);
        renderChatUI(body as HTMLElement);
      }
    },
    onItemChange: async ({ item, setEnabled, tabType }) => {
      setEnabled(tabType === "reader");
      if (item) {
        const itemKey = `item_${item.id}`;
        await chatService.initSession(itemKey);
      }
      return true;
    },
    sectionButtons: [
      {
        type: "clear",
        icon: "chrome://zotero/skin/16/universal/empty-trash.svg",
        l10nID: getLocaleID("ai-chat-clear-button"),
        onClick: async ({ paneID }) => {
          await chatService.clearContext();
          const container = document.getElementById("ai-chat-container");
          if (container) renderChatUI(container);
        },
      },
    ],
  });
}

function renderChatUI(container: HTMLElement): void {
  const messages = chatService.getContext();

  container.innerHTML = `
    <div class="ai-chat-container">
      <div class="ai-chat-messages" id="chat-messages">
        ${messages.length === 0 ? '<div class="ai-chat-empty">Select text in PDF and ask questions</div>' : ""}
        ${messages.map(m => `
          <div class="ai-chat-message ${m.role}">
            <div class="ai-chat-role">${m.role === "user" ? "You" : "AI"}</div>
            <div class="ai-chat-content">${escapeHtml(m.content)}</div>
          </div>
        `).join("")}
      </div>
      <div class="ai-chat-input-area">
        <textarea id="chat-input" placeholder="Ask about selected text..." rows="2"></textarea>
        <button id="chat-send-btn">Send</button>
      </div>
    </div>
  `;

  // Add send handler
  const sendBtn = document.getElementById("chat-send-btn");
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;

  sendBtn?.addEventListener("click", async () => {
    const text = input?.value?.trim();
    if (!text) return;

    // Get selected text from PDF viewer
    const selectedText = getSelectedPDFText();
    if (!selectedText) {
      alert("Please select text in the PDF first.");
      return;
    }

    const config = getLLMConfig();
    try {
      sendBtn.setAttribute("disabled", "true");
      input.value = "";
      const response = await chatService.sendMessage(text, selectedText, getDefaultProvider(), config);
      renderChatUI(container);
    } catch (error) {
      ztoolkit.log("Chat error:", error);
      alert(`Error: ${error}`);
    } finally {
      sendBtn.removeAttribute("disabled");
    }
  });
}

function getSelectedPDFText(): string {
  // Try to get selected text from Zotero's PDF viewer
  try {
    const readerWindow = Zotero.getMainWindow().Zotero_Reader_Integration?.getReader?.();
    if (readerWindow && readerWindow.contentWindow) {
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
    provider,
    apiKey: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.apiKey.${provider}`) as string,
    endpoint: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.endpoint.${provider}`) as string,
    model: Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.model.${provider}`) as string,
    temperature: 0.7,
    maxTokens: 2048,
  };
}

function getDefaultProvider(): string {
  return Zotero.Prefs.get(`${addon.data.config.prefsPrefix}.defaultProvider`) as string || "openai";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
  delete Zotero[addon.data.config.addonInstance];
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
      registerPrefsScripts(data.window);
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

function registerPrefsScripts(win: Window): void {
  // Preference script registration
  ztoolkit.log("Loading preference scripts");
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