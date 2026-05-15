import { getString, getLocaleID, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { llmService } from "./modules/llm/LLMService";
import { pdfService } from "./modules/pdf/PDFService";
import { chatService } from "./modules/chat/ChatService";
import { getPref } from "./utils/prefs";
import type { LLMConfig } from "./modules/types";

// Module-level cache for config values (since Zotero.Prefs doesn't work in sandbox)
let cachedConfig: {
  prefsPrefix: string;
  defaultProvider: string;
  apiKey_generic: string;
  endpoint_generic: string;
  model_generic: string;
} | null = null;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Cache config values at startup (before sandboxed contexts run)
  cachedConfig = {
    prefsPrefix: addon.data.config.prefsPrefix,
    defaultProvider: (getPref("defaultProvider") as string) || "openai",
    apiKey_generic: (getPref("apiKey.generic") as string) || "",
    endpoint_generic: (getPref("endpoint.generic") as string) || "",
    model_generic: (getPref("model.generic") as string) || "",
  };
  ztoolkit.log("Cached config:", JSON.stringify(cachedConfig));

  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
    scripts: [rootURI + "content/preferences.js"],
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
      l10nID: getLocaleID("ai-reader-toc-header"),
      icon: "chrome://zotero/skin/16/universal/book.svg",
    },
    sidenav: {
      l10nID: getLocaleID("ai-reader-toc-sidenav"),
      icon: "chrome://zotero/skin/16/universal/book.svg",
    },
    bodyXHTML:
      '<html:div id="ai-toc-container" class="ai-panel-container"/>',
    onRender: ({ body, item }) => {
      if (item) renderTOCPanel(body as HTMLElement, item);
    },
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
      }
      return true;
    },
    sectionButtons: [
      {
        type: "refresh",
        icon: "chrome://zotero/skin/16/universal/refresh.svg",
        l10nID: getLocaleID("ai-reader-toc-refresh-button"),
        onClick: async ({ item, body }) => {
          ztoolkit.log("TOC BUTTON CLICKED at last!");
          if (item && body) {
            // Update cache from prefs using getPref (Services.prefs)
            cachedConfig = {
              prefsPrefix: addon.data.config.prefsPrefix,
              defaultProvider: (getPref("defaultProvider") as string) || "openai",
              apiKey_generic: (getPref("apiKey.generic") as string) || "",
              endpoint_generic: (getPref("endpoint.generic") as string) || "",
              model_generic: (getPref("model.generic") as string) || "",
            };
            ztoolkit.log("Updated cache from prefs:", JSON.stringify(cachedConfig));
            await generateTOC(body as HTMLElement, item);
          } else {
            ztoolkit.log("item or body missing!", { item, body });
          }
        },
      },
    ],
  });

  // Right panel - AI Chat
  Zotero.ItemPaneManager.registerSection({
    paneID: "ai-reader-chat",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("ai-reader-chat-header"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/ai-chat.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("ai-reader-chat-sidenav"),
      icon: "chrome://zotero/skin/20/universal/chat.svg",
    },
    bodyXHTML:
      '<html:div id="ai-chat-container" class="ai-panel-container"/>',
    onRender: ({ body }) => {
      renderChatUI(body as HTMLElement);
    },
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
      }
      return true;
    },
    sectionButtons: [
      {
        type: "clear",
        icon: "chrome://zotero/skin/16/universal/empty-trash.svg",
        l10nID: getLocaleID("ai-reader-clear-button"),
        onClick: async ({ body }) => {
          await chatService.clearContext();
          if (body) renderChatUI(body as HTMLElement);
        },
      },
    ],
  });
}

function renderTOCPanel(container: HTMLElement, _item: Zotero.Item): void {
  container.innerHTML = `
    <html:div class="ai-toc-container">
      <html:div class="ai-toc-list" id="toc-list">
        <html:div class="ai-toc-empty">点击上方按钮生成目录</html:div>
      </html:div>
    </html:div>
  `;
}

async function generateTOC(container: HTMLElement, item: Zotero.Item): Promise<void> {
  ztoolkit.log("generateTOC called, container:", container?.id, container?.childNodes.length);
  const listEl = container.querySelector("#toc-list");
  if (listEl) listEl.innerHTML = '<html:div class="ai-toc-loading">生成中...</html:div>';

  const progressWindow = new ztoolkit.ProgressWindow("AI Reader", {
    closeOnClick: true,
  });

  try {
    progressWindow.createLine({
      text: "读取配置...",
      type: "default",
      progress: 5,
    });

    // Update cache from prefs using getPref (Services.prefs)
    cachedConfig = {
      prefsPrefix: addon.data.config.prefsPrefix,
      defaultProvider: (getPref("defaultProvider") as string) || "openai",
      apiKey_generic: (getPref("apiKey.generic") as string) || "",
      endpoint_generic: (getPref("endpoint.generic") as string) || "",
      model_generic: (getPref("model.generic") as string) || "",
    };
    progressWindow.changeLine({ progress: 10, text: `Provider: ${cachedConfig.defaultProvider}, API Key: ${cachedConfig.apiKey_generic ? "已设置" : "未设置"}` });

    const provider = getDefaultProvider();
    const config = getLLMConfig();
    progressWindow.changeLine({ progress: 15, text: `Provider: ${provider}, API Key: ${config.apiKey ? "已设置" : "空"}` });

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
    if (!paragraphs.length) {
      throw new Error("No valid paragraphs extracted from PDF");
    }

    // Get total pages from the open reader for proportional page estimation
    const readerTotalPages: number = (() => {
      const readers = (Zotero as any).Reader?._readers;
      if (!readers || readers.length === 0) return 0;
      const pv = readers[0]._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfViewer;
      return pv?.pagesCount || 0;
    })();

    // Check if parseParagraphs produced real page markers (more than one distinct page value)
    const distinctPages = new Set(paragraphs.map((p) => p.page)).size;
    const hasRealPageMarkers = distinctPages > 1;
    ztoolkit.log("Page markers:", distinctPages, "distinct pages, hasRealPageMarkers:", hasRealPageMarkers, "readerTotalPages:", readerTotalPages);

    progressWindow.changeLine({ progress: 60, text: "Generating TOC with AI..." });

    ztoolkit.log("TOC generateTOC step 1 - provider:", provider, "config.apiKey:", config.apiKey ? "SET" : "EMPTY", "config.endpoint:", config.endpoint);
    const configError = validateLLMConfig(provider, config);
    ztoolkit.log("TOC configError:", configError);
    if (configError) {
      if (listEl) listEl.innerHTML = `<html:div class="ai-toc-empty">${escapeHtml(configError)}</html:div>`;
      return;
    }

    ztoolkit.log("TOC calling llmService.generateTOC...");
    const tocItems = await llmService.generateTOC(
      provider,
      paragraphs.map((p) => p.text),
      config
    );

    const normalizedTOCItems = tocItems
      .map((tocItem: any) => {
        const rawIndex = Number(tocItem.paragraphIndex);
        const zeroBasedIndex = Number.isFinite(rawIndex)
          ? Math.max(0, rawIndex > 0 ? rawIndex - 1 : rawIndex)
          : 0;
        const paragraph = paragraphs[zeroBasedIndex];

        // Determine page: use real page marker if available, otherwise estimate
        // proportionally from paragraph position within the document.
        let page: number | undefined;
        if (hasRealPageMarkers) {
          page = paragraph?.page;
        } else if (readerTotalPages > 0 && paragraphs.length > 0) {
          // Proportional estimate: paragraphIndex / totalParagraphs * totalPages
          page = Math.max(1, Math.round((zeroBasedIndex / paragraphs.length) * readerTotalPages) + 1);
        }

        return {
          ...tocItem,
          paragraphIndex: zeroBasedIndex,
          page,
        };
      })
      .filter((tocItem: any) => typeof tocItem.title === "string" && tocItem.title.trim());

    addon.data.reader!.toc = normalizedTOCItems;

    progressWindow.changeLine({ progress: 100, text: "TOC generated!" });
    progressWindow.startCloseTimer(2000);

    if (listEl) {
      if (normalizedTOCItems.length === 0) {
        listEl.innerHTML = '<html:div class="ai-toc-empty">无法生成目录</html:div>';
      } else {
        listEl.innerHTML = normalizedTOCItems
          .map(
            (item: any) => `
          <html:div class="ai-toc-item level-${item.level}" data-paragraph-index="${item.paragraphIndex}" data-page="${item.page || ""}">
            <html:span class="ai-toc-icon">${item.level === 1 ? "📄" : "📃"}</html:span>
            <html:span class="ai-toc-title">${escapeHtml(item.title)}</html:span>
            ${item.page ? `<html:span class="ai-toc-page">P${item.page}</html:span>` : ""}
          </html:div>
        `
          )
          .join("");

        listEl.querySelectorAll(".ai-toc-item").forEach((el: Element) => {
          el.addEventListener("click", async () => {
            const idx = el.getAttribute("data-paragraph-index");
            const page = el.getAttribute("data-page");
            if (page && Number.isFinite(Number(page))) {
              await navigateToPDFPage(Number(page));
              return;
            }
            if (idx) scrollToParagraph(parseInt(idx));
          });
        });
      }
    }
  } catch (error) {
    ztoolkit.log("TOC generation error:", error);
    if (listEl) listEl.innerHTML = `<html:div class="ai-toc-empty">Error: ${error}</html:div>`;
  }
}

function renderChatUI(container: HTMLElement): void {
  const messages = chatService.getContext();
  const doc = container.ownerDocument;
  const ns = "http://www.w3.org/1999/xhtml";

  // Set innerHTML for the static structure (no interactive elements that get stripped)
  container.innerHTML = `
    <html:div class="ai-chat-container">
      <html:div class="ai-chat-messages" id="chat-messages">
        ${
          messages.length === 0
            ? '<html:div class="ai-chat-empty">在 PDF 中选中文字后提问</html:div>'
            : messages
                .map(
                  (m) => `
            <html:div class="ai-chat-message ${m.role}">
              <html:div class="ai-chat-role">${m.role === "user" ? "你" : "AI"}</html:div>
              <html:div class="ai-chat-content">${escapeHtml(m.content)}</html:div>
            </html:div>
          `
                )
                .join("")
        }
      </html:div>
      <html:div class="ai-chat-input-area">
        <html:textarea id="chat-input" placeholder="输入问题（Ctrl+Enter 发送）..." rows="3"></html:textarea>
      </html:div>
    </html:div>
  `;

  // Add Send button via createElement (bypasses innerHTML sanitizer)
  const inputArea = container.querySelector(".ai-chat-input-area");
  const sendBtn = doc.createElementNS(ns, "span") as HTMLElement;
  sendBtn.id = "chat-send-btn";
  sendBtn.className = "ai-chat-send-btn";
  sendBtn.setAttribute("role", "button");
  sendBtn.setAttribute("tabindex", "0");
  sendBtn.textContent = "发送";
  inputArea?.appendChild(sendBtn);

  // Scroll messages to bottom
  const messagesEl = container.querySelector("#chat-messages") as HTMLElement | null;
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;

  const input = container.querySelector("#chat-input") as HTMLTextAreaElement | null;

  async function handleSend() {
    if (!input) return;
    const text = input.value?.trim();
    if (!text) return;

    const selectedText = getSelectedPDFText();
    const provider = getDefaultProvider();
    const config = getLLMConfig();
    const configError = validateLLMConfig(provider, config);
    if (configError) {
      ztoolkit.log("Chat config error:", configError);
      // Show error inline instead of alert
      const errDiv = doc.createElementNS(ns, "div") as HTMLElement;
      errDiv.className = "ai-chat-error";
      errDiv.textContent = configError;
      inputArea?.insertBefore(errDiv, input);
      setTimeout(() => errDiv.remove(), 4000);
      return;
    }

    try {
      sendBtn.setAttribute("aria-disabled", "true");
      sendBtn.textContent = "...";
      input.value = "";
      await chatService.sendMessage(text, selectedText || "", provider, config);
      renderChatUI(container);
    } catch (error) {
      ztoolkit.log("Chat error:", error);
      sendBtn.textContent = "发送";
      sendBtn.removeAttribute("aria-disabled");
      const errDiv = doc.createElementNS(ns, "div") as HTMLElement;
      errDiv.className = "ai-chat-error";
      errDiv.textContent = `Error: ${error}`;
      inputArea?.insertBefore(errDiv, input);
      setTimeout(() => errDiv.remove(), 5000);
    }
  }

  sendBtn.addEventListener("click", handleSend);

  // Ctrl+Enter to send
  input?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  });
}

function getSelectedPDFText(): string {
  try {
    // Try getting selection from the PDF reader iframe
    const readers = (Zotero as any).Reader?._readers;
    if (readers && readers.length > 0) {
      const iframeWindow = readers[0]?._iframeWindow;
      if (iframeWindow) {
        const selection = iframeWindow.getSelection?.();
        const text = selection?.toString().trim();
        if (text) return text;
      }
    }
  } catch {
    // Fallback
  }
  // Also try main window selection
  try {
    const mainWin = (Zotero as any).getMainWindow?.();
    if (mainWin) {
      const selection = mainWin.getSelection?.();
      const text = selection?.toString().trim();
      if (text) return text;
    }
  } catch {
    // ignore
  }
  return "";
}

function getLLMConfig(): LLMConfig {
  const provider = getDefaultProvider();
  // Use getPref which uses Services.prefs for reliability
  const apiKey = (getPref(`apiKey.${provider}`) as string) || cachedConfig?.apiKey_generic || "";
  const endpoint = (getPref(`endpoint.${provider}`) as string) || cachedConfig?.endpoint_generic || "";
  const model = (getPref(`model.${provider}`) as string) || cachedConfig?.model_generic || "";
  ztoolkit.log("getLLMConfig - provider:", provider, "apiKey:", apiKey ? "SET" : "EMPTY", "endpoint:", endpoint);
  return {
    provider: provider as LLMConfig["provider"],
    apiKey,
    endpoint,
    model,
    temperature: 0.7,
    maxTokens: 2048,
  };
}

// Check if cached config has stale values by checking if a prefs update happened
function getDefaultProvider(): string {
  // Use getPref which leverages Services.prefs for reliability
  const provider = getPref("defaultProvider") as string;
  if (provider) {
    ztoolkit.log("getDefaultProvider:", provider);
    return provider;
  }
  return cachedConfig?.defaultProvider || "openai";
}

function validateLLMConfig(provider: string, config: LLMConfig): string | null {
  if (provider === "openai" && !config.apiKey?.trim()) {
    return "OpenAI API key is required. Please set it in plugin preferences.";
  }

  if (provider === "generic") {
    if (!config.apiKey?.trim()) {
      return "Generic API key is required. Please set it in plugin preferences.";
    }
    if (!config.endpoint?.trim()) {
      return "Generic API endpoint is required. Please set it in plugin preferences.";
    }
  }

  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function navigateToPDFPage(page: number): Promise<void> {
  if (!Number.isFinite(page) || page < 1) {
    ztoolkit.log("Invalid page number:", page);
    return;
  }

  try {
    // Get reader from Zotero.Reader._readers
    const readers = Zotero.Reader._readers;
    if (!readers || readers.length === 0) {
      ztoolkit.log("No readers found");
      return;
    }

    const reader = readers[0];
    const primaryView = reader._internalReader?._primaryView;

    if (!primaryView) {
      ztoolkit.log("No primaryView found");
      return;
    }

    // Get total pages and validate page number
    const totalPages = reader._internalReader._state.pageLabels?.length || 1;
    const validPage = Math.min(page, totalPages);
    if (validPage !== page) {
      ztoolkit.log(`Page ${page} exceeds total pages ${totalPages}, capping to ${validPage}`);
    }

    // Use _iframeWindow.PDFViewerApplication.pdfViewer._setCurrentPageNumber directly
    // This is more reliable than the navigate() method which has async issues
    const iframeWindow = (primaryView as any)._iframeWindow;
    const pdfViewer = iframeWindow?.PDFViewerApplication?.pdfViewer;

    if (pdfViewer && typeof pdfViewer._setCurrentPageNumber === "function") {
      pdfViewer._setCurrentPageNumber(validPage, true);
      ztoolkit.log(`Navigated to page ${validPage}`);
      return;
    }

    // Fallback to navigate method if pdfViewer approach doesn't work
    const navigateFn = (primaryView as any).navigate;
    if (typeof navigateFn === "function") {
      await navigateFn.call(primaryView, { pageIndex: validPage - 1 });
      ztoolkit.log(`Navigated to page ${validPage}`);
      return;
    }

    ztoolkit.log("No navigation method available");
  } catch (error) {
    ztoolkit.log("Failed to navigate PDF page:", error);
  }
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
      await registerPrefsScripts(data.window as Window);
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