import { BaseLLMProvider } from "./base";
import type { ChatMessage, LLMConfig } from "../../types";

export class ClaudeProvider extends BaseLLMProvider {
  name = "claude";

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    if (!config.apiKey) {
      throw new Error("Claude API key not configured");
    }

    const endpoint = config.endpoint || "https://api.anthropic.com/v1/messages";
    const model = config.model || "claude-3-5-sonnet-20241022";

    const systemMessages = messages.filter((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemMessages.map((m) => m.content).join("\n\n"),
        messages: chatMessages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const textBlock = data.content?.find((block: any) => block.type === "text");
    return textBlock?.text || "";
  }

  getCapabilities() {
    return {
      streaming: true,
      functionCalls: true,
      vision: true,
    };
  }
}
