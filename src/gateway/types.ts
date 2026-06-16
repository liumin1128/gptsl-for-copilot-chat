export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIResponsesRequest {
  model: string;
  input: ChatMessage[];
  stream: true;
  max_output_tokens?: number;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: ChatMessage[];
  stream: true;
  max_tokens?: number;
}
