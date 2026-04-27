import { getLocaleID } from "../../utils/locale";
import { pdfService } from "../pdf/PDFService";
import { llmService } from "../llm/LLMService";
import type { TOCItem, LLMConfig } from "../../types";

export class TOCPanel {
  private container: HTMLElement | null = null;
  private tocItems: TOCItem[] = [];
  private currentItem: Zotero.Item | null = null;

  async init(item: Zotero.Item, container: HTMLElement): Promise<void> {
    this.currentItem = item;
    this.container = container;
    await this.render();
  }

  async generateTOC(providerName: string, config: LLMConfig): Promise<void> {
    if (!this.currentItem) return;

    const progressWindow = new ztoolkit.ProgressWindow("AI Reader", {
      closeOnClick: true,
    });

    try {
      progressWindow.createLine({
        text: "Extracting PDF text...",
        type: "default",
        progress: 20,
      });

      // Get PDF attachment
      const attachments = await this.currentItem.getAttachments();
      if (!attachments || attachments.length === 0) {
        throw new Error("No attachments found");
      }

      const pdfAttachment = attachments.find(
        (a: Zotero.Item) => a.attachmentContentType === "application/pdf"
      );
      if (!pdfAttachment) {
        throw new Error("No PDF attachment found");
      }

      progressWindow.changeLine({ progress: 40, text: "Parsing paragraphs..." });
      const text = await pdfService.extractText(pdfAttachment);
      const paragraphs = pdfService.parseParagraphs(text);

      progressWindow.changeLine({ progress: 60, text: "Generating TOC with AI..." });
      this.tocItems = await llmService.generateTOC(
        providerName,
        paragraphs.map((p) => p.text),
        config
      );

      progressWindow.changeLine({ progress: 100, text: "TOC generated!" });
      progressWindow.startCloseTimer(2000);

      await this.render();
    } catch (error) {
      ztoolkit.log("TOC generation error:", error);
      progressWindow.createLine({
        text: `Error: ${error}`,
        type: "error",
      });
    }
  }

  private async render(): Promise<void> {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="ai-toc-container">
        <div class="ai-toc-header">
          <span>AI 目录</span>
          <button class="ai-toc-refresh" id="toc-refresh-btn" title="Generate TOC">⟳</button>
        </div>
        <div class="ai-toc-list" id="toc-list">
          ${this.tocItems.length === 0 ? '<div class="ai-toc-empty">点击按钮生成目录</div>' : ""}
          ${this.tocItems
            .map(
              (item) => `
            <div class="ai-toc-item level-${item.level}" data-paragraph-index="${item.paragraphIndex}">
              <span class="ai-toc-icon">${item.level === 1 ? "📄" : "📃"}</span>
              <span class="ai-toc-title">${item.title}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    // Add click handlers
    this.container.querySelectorAll(".ai-toc-item").forEach((el) => {
      el.addEventListener("click", () => {
        const paragraphIndex = el.getAttribute("data-paragraph-index");
        if (paragraphIndex !== null) {
          this.scrollToParagraph(parseInt(paragraphIndex));
        }
      });
    });
  }

  private scrollToParagraph(index: number): void {
    // Emit event to scroll PDF reader to paragraph
    const event = new CustomEvent("ai-reader-scroll-to-paragraph", {
      detail: { index },
    });
    window.dispatchEvent(event);
  }

  update(item: Zotero.Item): void {
    this.currentItem = item;
    this.render();
  }
}

export const tocPanel = new TOCPanel();