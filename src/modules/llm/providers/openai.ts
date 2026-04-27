import { BaseLLMProvider } from "./base";
import type { ChatMessage, LLMConfig } from "../../types";

export class OpenAIProvider extends BaseLLMProvider {
  name = "openai";

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const endpoint = config.endpoint || "https://api.openai.com/v1/chat/completions";
    const model = config.model || "gpt-4";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: this.buildMessages(messages),
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  getCapabilities() {
    return {
      streaming: true,
      functionCalls: true,
      vision: false,
    };
  }
}