import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import { GenericProvider } from "./providers/generic";
import type { LLMProvider, ChatMessage, LLMConfig } from "./types";

export class LLMService {
  private providers: Map<string, LLMProvider> = new Map();

  constructor() {
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new OllamaProvider());
    this.registerProvider(new GenericProvider());
  }

  private registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  async chat(
    providerName: string,
    messages: ChatMessage[],
    config: LLMConfig
  ): Promise<string> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    return provider.chat(messages, config);
  }

  async summarizeParagraph(
    providerName: string,
    paragraphText: string,
    config: LLMConfig
  ): Promise<string> {
    const systemPrompt = `You are a research assistant helping summarize academic paper content. Summarize the following paragraph in Chinese. Be concise but capture the key points.`;
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt, timestamp: Date.now() },
      { role: "user", content: paragraphText, timestamp: Date.now() },
    ];
    return this.chat(providerName, messages, config);
  }

  async generateTOC(
    providerName: string,
    paragraphs: string[],
    config: LLMConfig
  ): Promise<{ title: string; level: number; paragraphIndex: number }[]> {
    const textForAnalysis = paragraphs
      .map((p, i) => `[段落${i + 1}]\n${p}`)
      .join("\n\n");

    const systemPrompt = `You are analyzing an academic paper to generate a table of contents. Based on the paper segments provided, generate a hierarchical table of contents. Return a JSON array of {title, level, paragraphIndex} objects. Level 1 for main sections (like "1. Introduction"), Level 2 for subsections. Only include meaningful sections, skip very short or trivial segments. Output in Chinese.`;
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt, timestamp: Date.now() },
      { role: "user", content: textForAnalysis, timestamp: Date.now() },
    ];

    const response = await this.chat(providerName, messages, config);

    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[.*\]/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch {
      ztoolkit.log("Failed to parse TOC response:", response);
      return [];
    }
  }
}

export const llmService = new LLMService();