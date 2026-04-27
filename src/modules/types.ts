export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface TOCItem {
  id: string;
  title: string;
  level: number;
  page?: number;
  paragraphIndex?: number;
}

export interface LLMConfig {
  provider: "openai" | "claude" | "ollama" | "generic";
  apiKey?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PDFParagraph {
  index: number;
  text: string;
  page?: number;
}

export interface ChatSession {
  itemKey: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}