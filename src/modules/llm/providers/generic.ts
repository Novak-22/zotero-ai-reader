import { BaseLLMProvider } from "./base";
import type { ChatMessage, LLMConfig } from "../../types";

export class GenericProvider extends BaseLLMProvider {
  name = "generic";

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    if (!config.endpoint) {
      throw new Error("API endpoint not configured");
    }

    if (!config.apiKey) {
      throw new Error("API key not configured");
    }

    // Resolve endpoint - use as-is if it has a path, otherwise append standard OpenAI path
    let endpoint = config.endpoint.trim();
    if (!endpoint.includes("/v1") && !endpoint.includes("/chat")) {
      endpoint = endpoint.replace(/\/$/, "") + "/v1/chat/completions";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "unknown",
        messages: this.buildMessages(messages),
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();

    // Try common response formats
    return (
      data.choices?.[0]?.message?.content ||
      data.content ||
      data.text ||
      JSON.stringify(data)
    );
  }

  getCapabilities() {
    return {
      streaming: false,
      functionCalls: false,
      vision: false,
    };
  }
}