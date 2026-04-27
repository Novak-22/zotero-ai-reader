import type { ChatMessage, LLMConfig } from "../types";

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], config: LLMConfig): Promise<string>;
  getCapabilities(): ProviderCapabilities;
}

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalls: boolean;
  vision: boolean;
}

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;

  abstract chat(messages: ChatMessage[], config: LLMConfig): Promise<string>;

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: false,
      functionCalls: false,
      vision: false,
    };
  }

  protected buildMessages(messages: ChatMessage[]): any[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }
}