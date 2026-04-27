import type { PDFParagraph } from "../types";

export class PDFService {
  /**
   * Extract text from a Zotero attachment item
   */
  async extractText(attachment: Zotero.Item): Promise<string> {
    if (!attachment.isImportedAttachment) {
      throw new Error("Item is not an attachment");
    }

    if (attachment.attachmentContentType !== "application/pdf") {
      throw new Error("Attachment is not a PDF");
    }

    try {
      const text = await attachment.attachmentText;
      return text || "";
    } catch (error) {
      ztoolkit.log("Failed to extract PDF text:", error);
      throw error;
    }
  }

  /**
   * Split text into paragraphs based on empty lines and common delimiters
   */
  parseParagraphs(text: string): PDFParagraph[] {
    // Split by newlines and filter empty lines
    const lines = text.split(/\r?\n/);
    const paragraphs: PDFParagraph[] = [];
    let currentParagraph = "";
    let paragraphIndex = 0;
    let pageNumber = 1;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect page break markers (common in extracted PDFs)
      const pageMatch = trimmed.match(/^(?:Page:\s*)?(\d+)$/);
      if (pageMatch) {
        pageNumber = parseInt(pageMatch[1], 10);
        continue;
      }

      // Empty line marks paragraph boundary
      if (trimmed === "" && currentParagraph.trim()) {
        const paragraphText = currentParagraph.trim();
        if (paragraphText.length > 20) {
          // Only keep substantial paragraphs
          paragraphs.push({
            index: paragraphIndex++,
            text: paragraphText,
            page: pageNumber,
          });
        }
        currentParagraph = "";
      } else if (trimmed) {
        currentParagraph += (currentParagraph ? " " : "") + trimmed;
      }
    }

    // Don't forget the last paragraph
    if (currentParagraph.trim() && currentParagraph.trim().length > 20) {
      paragraphs.push({
        index: paragraphIndex,
        text: currentParagraph.trim(),
        page: pageNumber,
      });
    }

    return paragraphs;
  }

  /**
   * Extract captions from images/figures in the text
   */
  extractCaptions(text: string): { type: "figure" | "table"; caption: string }[] {
    const captions: { type: "figure" | "table"; caption: string }[] = [];

    // Common caption patterns
    const patterns = [
      /Figure\s+(\d+[.\d]*)\s*[:\.]\s*(.+?)(?=\n\n|$)/gi,
      /Fig\.\s*(\d+[.\d]*)\s*[:\.]\s*(.+?)(?=\n\n|$)/gi,
      /Table\s+(\d+[.\d]*)\s*[:\.]\s*(.+?)(?=\n\n|$)/gi,
      /表\s*(\d+[.\d]*)\s*[:\.]\s*(.+?)(?=\n\n|$)/gi,
      /图\s*(\d+[.\d]*)\s*[:\.]\s*(.+?)(?=\n\n|$)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const type = pattern.source.startsWith("Table") || pattern.source.startsWith("表")
          ? "table"
          : "figure";
        captions.push({
          type,
          caption: match[2].trim(),
        });
      }
    }

    return captions;
  }
}

export const pdfService = new PDFService();