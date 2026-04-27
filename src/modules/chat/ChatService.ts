import { chatStorage } from "./ChatStorage";
import { llmService } from "../llm/LLMService";
import type { ChatMessage, LLMConfig } from "../types";

export class ChatService {
  private context: ChatMessage[] = [];
  private itemKey: string = "";

  async initSession(itemKey: string): Promise<void> {
    this.itemKey = itemKey;
    this.context = await chatStorage.getMessages(itemKey);
  }

  async sendMessage(
    content: string,
    selectedText: string,
    provider: string,
    config: LLMConfig
  ): Promise<string> {
    // Build context with selected text
    const userMessage: ChatMessage = {
      role: "user",
      content: `Selected text from PDF: "${selectedText}"\n\nMy question: ${content}`,
      timestamp: Date.now(),
    };

    this.context.push(userMessage);
    await chatStorage.saveMessage(this.itemKey, "user", userMessage.content);

    // Generate response
    const systemPrompt = `You are a research assistant helping analyze academic papers. You have access to the selected text from the PDF. Answer questions about the text accurately. If the selected text doesn't contain relevant information, say so.`;
    const fullMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt, timestamp: Date.now() },
      ...this.context,
    ];

    try {
      const response = await llmService.chat(provider, fullMessages, config);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };

      this.context.push(assistantMessage);
      await chatStorage.saveMessage(this.itemKey, "assistant", response);

      return response;
    } catch (error) {
      ztoolkit.log("Chat error:", error);
      throw error;
    }
  }

  getContext(): ChatMessage[] {
    return this.context;
  }

  async clearContext(): Promise<void> {
    this.context = [];
    await chatStorage.clearMessages(this.itemKey);
  }
}

export const chatService = new ChatService();