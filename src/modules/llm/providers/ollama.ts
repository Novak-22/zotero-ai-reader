import { BaseLLMProvider } from "./base";
import type { ChatMessage, LLMConfig } from "../../types";

export class OllamaProvider extends BaseLLMProvider {
  name = "ollama";

  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const baseUrl = config.endpoint || "http://localhost:11434";
    const model = config.model || "llama3";

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: this.buildMessages(messages),
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    return data.message?.content || "";
  }

  getCapabilities() {
    return {
      streaming: false,
      functionCalls: false,
      vision: false,
    };
  }
}