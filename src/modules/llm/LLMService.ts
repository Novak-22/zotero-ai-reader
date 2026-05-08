import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import { GenericProvider } from "./providers/generic";
import type { LLMProvider, ChatMessage, LLMConfig } from "../types";

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

    // Very explicit system prompt with JSON output instruction
    const systemPrompt = `You are a JSON API. Your responses must be EXCLUSIVELY valid JSON. No text before or after. Example: [{"title":"1. Introduction","level":1,"paragraphIndex":0}]`;
    const userPrompt = `You are an API that returns JSON. Output ONLY this exact JSON format, nothing else: [{"title":"Section Name","level":1,"paragraphIndex":N}]

Analyze these paper sections and output JSON:
${textForAnalysis}`;
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt, timestamp: Date.now() },
      { role: "user", content: userPrompt, timestamp: Date.now() },
    ];

    const response = await this.chat(providerName, messages, config);
    ztoolkit.log("TOC raw response:", response);

    try {
      // Extract JSON array from response - need to handle thinking text before JSON
      const jsonArray = extractJSONArray(response);
      if (jsonArray) {
        ztoolkit.log("TOC parsed:", jsonArray);
        return jsonArray;
      }
      // Try parsing the whole response as JSON
      const parsed = JSON.parse(response);
      ztoolkit.log("TOC parsed directly:", parsed);
      return parsed;
    } catch (e) {
      ztoolkit.log("Failed to parse TOC response:", response, e);
      return [];
    }
  }
}

/**
 * Extract the first valid JSON array from a string that may contain
 * thinking/reasoning text before or after the JSON.
 * Looks for the pattern "[{" and validates the parsed content.
 */
function extractJSONArray(text: string): { title: string; level: number; paragraphIndex: number }[] | null {
  // Look for "[{" pattern which marks the start of our JSON array
  let searchStart = 0;
  while (searchStart < text.length) {
    const startIdx = text.indexOf("[{", searchStart);
    if (startIdx === -1) return null;

    const jsonStart = startIdx;

    // Find the matching closing ']' using a simple stack approach
    let depth = 0;
    let endIdx = -1;
    for (let i = jsonStart; i < text.length; i++) {
      const char = text[i];
      if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) return null;

    const jsonStr = text.substring(jsonStart, endIdx + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate this looks like our TOC format (has title and level fields)
        if (typeof parsed[0] === 'object' && 'title' in parsed[0] && 'level' in parsed[0]) {
          return parsed;
        }
      }
    } catch {
      // Not valid JSON, continue searching
    }

    // Move past this occurrence and continue searching
    searchStart = startIdx + 1;
  }
  return null;
}

export const llmService = new LLMService();
