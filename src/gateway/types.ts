export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** VS Code 消息转换为网关消息时使用的中间格式 */
export interface OpenAIResponsesInputMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAIResponsesFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
  status: "completed";
}

export interface OpenAIResponsesFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
  status: "completed";
}

export type OpenAIResponsesInputItem =
  | OpenAIResponsesInputMessage
  | OpenAIResponsesFunctionCall
  | OpenAIResponsesFunctionCallOutput;

/** Anthropic 消息格式中的内容块 */
export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

/** Anthropic thinking block */
export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicThinkingBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

/** 流解析器产出的统一格式 */
export interface StreamTextPart {
  type: "text";
  text: string;
}

export interface StreamToolCallPart {
  type: "tool_call";
  callId: string;
  name: string;
  arguments: string;
}

export interface StreamThinkingPart {
  type: "thinking";
  text: string;
}

export type StreamPart =
  | StreamTextPart
  | StreamToolCallPart
  | StreamThinkingPart;

export interface OpenAIResponsesRequest {
  model: string;
  input: OpenAIResponsesInputItem[];
  stream: true;
  max_output_tokens?: number;
  instructions?: string;
  tools?: OpenAIResponsesToolDef[];
  tool_choice?: "auto" | { type: "function"; name: string };
}

export interface OpenAIResponsesToolDef {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  stream: true;
  max_tokens?: number;
  system?: string;
  tools?: AnthropicToolDef[];
  tool_choice?: { type: "auto" } | { type: "tool"; name: string };
}

export interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

// ---- Token 用量 ----

/** Token 用量详情 */
export interface TokenUsageDetails {
  cached_tokens: number;
}

/** 标准 Token 用量结构 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: TokenUsageDetails;
}

// ---- 重试配置 ----

/** 重试配置 */
export interface RetryConfig {
  enabled?: boolean;
  max_attempts?: number;
  interval_ms?: number;
  status_codes?: number[];
}
