import * as vscode from "vscode";
import {
  OpenAIResponsesInputItem,
  OpenAIResponsesInputText,
  OpenAIResponsesInputImage,
  OpenAIResponsesFunctionCall,
  OpenAIResponsesFunctionCallOutput,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicImageBlock,
} from "./types";
import { isImagePart, toBase64 } from "../utils/imageHelper";

/** VS Code proposed API: LanguageModelThinkingPart (duck-typing) */
const LanguageModelThinkingPart = (
  vscode as unknown as {
    LanguageModelThinkingPart?: new (
      value: string | string[],
      id?: string,
    ) => { value: string | string[]; id?: string };
  }
).LanguageModelThinkingPart;

/** 类型守卫: 判断是否为 thinking part */
function isThinkingPart(
  part: unknown,
): part is { value: string | string[]; id?: string } {
  if (!part || typeof part !== "object") {
    return false;
  }
  // 尝试 instanceof
  if (LanguageModelThinkingPart && part instanceof LanguageModelThinkingPart) {
    return true;
  }
  // 回退 duck-typing: 有 value 且有 id 属性，且不是 TextPart/ToolCallPart
  if (part instanceof vscode.LanguageModelTextPart) {
    return false;
  }
  if (part instanceof vscode.LanguageModelToolCallPart) {
    return false;
  }
  const obj = part as Record<string, unknown>;
  return "value" in obj && "id" in obj;
}

/** 从 thinking part 中提取文本 */
function extractThinkingText(part: { value: string | string[] }): string {
  if (Array.isArray(part.value)) {
    return part.value.join("");
  }
  return part.value;
}

// ---- OpenAI Responses API 格式转换 ----

export interface OpenAIResponsesConversion {
  input: OpenAIResponsesInputItem[];
  instructions?: string;
}

export function toOpenAIResponsesInput(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): OpenAIResponsesConversion {
  const input: OpenAIResponsesInputItem[] = [];
  let instructions: string | undefined;

  for (const m of messages) {
    const role = mapRole(m);
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const imageParts: OpenAIResponsesInputImage[] = [];
    const toolCalls: OpenAIResponsesFunctionCall[] = [];
    const toolResults: OpenAIResponsesFunctionCallOutput[] = [];

    for (const part of m.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        const callId = part.callId || generateId("fc");
        let args = "{}";
        try {
          args = JSON.stringify(part.input ?? {});
        } catch {
          /* keep '{}' */
        }
        toolCalls.push({
          type: "function_call",
          call_id: callId,
          name: part.name,
          arguments: args,
          status: "completed",
        });
      } else if (isToolResultPart(part)) {
        const callId = (part as { callId?: string }).callId ?? "";
        const output = collectToolResultText(part);
        if (callId) {
          toolResults.push({
            type: "function_call_output",
            call_id: callId,
            output,
            status: "completed",
          });
        }
      } else if (isImagePart(part)) {
        const base64 = toBase64(part.data);
        const imageUrl = `data:${part.mimeType};base64,${base64}`;
        imageParts.push({
          type: "input_image",
          image_url: imageUrl,
          detail: "high",
        });
      } else if (isThinkingPart(part)) {
        thinkingParts.push(extractThinkingText(part));
      }
    }

    const joinedText = textParts.join("").trim();

    // 系统消息单独提取
    if (role === "system" && joinedText) {
      instructions = joinedText;
      continue;
    }

    // 助手消息: 先发 reasoning（thinking 回灌）, 再发文本，再发工具调用
    if (role === "assistant") {
      // 历史 thinking 回灌为 reasoning 项
      for (const tp of thinkingParts) {
        input.push({
          type: "reasoning",
          summary: [{ type: "summary_text", text: tp }],
        } as unknown as OpenAIResponsesInputItem);
      }
      if (joinedText) {
        input.push({ role: "assistant", content: joinedText });
      }
      for (const tc of toolCalls) {
        input.push(tc);
      }
      continue;
    }

    // 工具结果: 独立项 (role 为 user 时可能是工具结果)
    for (const tr of toolResults) {
      input.push(tr);
    }

    // 用户消息: 有图片时用数组格式，无图片时保持字符串
    if (role === "user" && (joinedText || imageParts.length > 0)) {
      if (imageParts.length > 0) {
        const contentItems: (
          | OpenAIResponsesInputText
          | OpenAIResponsesInputImage
        )[] = [];
        if (joinedText) {
          contentItems.push({ type: "input_text", text: joinedText });
        }
        contentItems.push(...imageParts);
        input.push({ role: "user", content: contentItems });
      } else if (joinedText) {
        input.push({ role: "user", content: joinedText });
      }
    }
  }

  return { input, instructions };
}

// ---- Anthropic Messages API 格式转换 ----

export interface AnthropicConversion {
  messages: AnthropicMessage[];
  system?: string;
}

export function toAnthropicMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): AnthropicConversion {
  const out: AnthropicMessage[] = [];
  let system: string | undefined;

  for (const m of messages) {
    const role = mapRole(m);
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const imageBlocks: AnthropicImageBlock[] = [];
    const toolCalls: AnthropicToolUseBlock[] = [];
    const toolResults: AnthropicToolResultBlock[] = [];

    for (const part of m.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        const id = part.callId || generateId("toolu");
        toolCalls.push({
          type: "tool_use",
          id,
          name: part.name,
          input: (part.input as Record<string, unknown>) ?? {},
        });
      } else if (isToolResultPart(part)) {
        const callId = (part as { callId?: string }).callId ?? "";
        const content = collectToolResultText(part);
        if (callId) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: callId,
            content,
          });
        }
      } else if (isImagePart(part)) {
        const base64 = toBase64(part.data);
        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: part.mimeType,
            data: base64,
          },
        });
      } else if (isThinkingPart(part)) {
        thinkingParts.push(extractThinkingText(part));
      }
    }

    const joinedText = textParts.join("").trim();

    // 系统消息单独提取 (Anthropic 用顶层 system 字段)
    if (role === "system" && joinedText) {
      system = joinedText;
      continue;
    }

    // 构建内容块
    const contentBlocks: AnthropicContentBlock[] = [];

    // 历史 thinking 回灌 (assistant 消息中 thinking block 应排在文本之前)
    if (role === "assistant") {
      for (const tp of thinkingParts) {
        contentBlocks.push({ type: "thinking", thinking: tp });
      }
    }

    if (joinedText) {
      contentBlocks.push({ type: "text", text: joinedText });
    }

    // 图片块追加在文本之后
    for (const img of imageBlocks) {
      contentBlocks.push(img);
    }

    if (role === "assistant") {
      for (const tc of toolCalls) {
        contentBlocks.push(tc);
      }
    }

    if (role === "user") {
      for (const tr of toolResults) {
        contentBlocks.push(tr);
      }
    }

    if (contentBlocks.length > 0) {
      const anthropicRole = role === "system" ? "user" : role;
      out.push({ role: anthropicRole, content: contentBlocks });
    }
  }

  return { messages: out, system };
}

// ---- 工具方法 ----

function mapRole(
  message: vscode.LanguageModelChatRequestMessage,
): "user" | "assistant" | "system" {
  const role = message.role as unknown as number;
  if (
    role === (vscode.LanguageModelChatMessageRole.User as unknown as number)
  ) {
    return "user";
  }
  if (
    role ===
    (vscode.LanguageModelChatMessageRole.Assistant as unknown as number)
  ) {
    return "assistant";
  }
  return "system";
}

/** 类型守卫: 判断是否为工具结果 part */
function isToolResultPart(
  value: unknown,
): value is { callId?: string; content?: ReadonlyArray<unknown> } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.callId === "string" && "content" in obj;
}

/**
 * 判断是否为 VS Code 内部元数据 data part（如 prompt caching 的 cache_control 标记）。
 * 这类 part 携带 mimeType + data，并非真实工具输出文本，需要跳过，
 * 否则 JSON.stringify 会把 {"$mid":24,"mimeType":"cache_control",...} 注入到内容里。
 */
function isMetadataDataPart(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.mimeType === "string" && "data" in obj;
}

/** 从工具结果 part 中提取文本 */
function collectToolResultText(part: {
  content?: ReadonlyArray<unknown>;
}): string {
  let text = "";
  for (const c of part.content ?? []) {
    if (c instanceof vscode.LanguageModelTextPart) {
      text += c.value;
    } else if (typeof c === "string") {
      text += c;
    } else if (isImagePart(c) || isMetadataDataPart(c)) {
      // 图片由上层单独处理；cache_control 等元数据 part 直接跳过
      continue;
    } else {
      try {
        text += JSON.stringify(c);
      } catch {
        /* ignore */
      }
    }
  }
  return text;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
