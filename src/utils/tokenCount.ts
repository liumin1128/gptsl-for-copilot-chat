import * as vscode from "vscode";
import { isImagePart } from "./imageHelper";

/** 每条消息的基础 token 开销 */
const BASE_MESSAGE_TOKENS = 3;

/** 图片的固定 token 估算值 (参考 OpenAI vision 成本: 每张 ~1020 token 高分辨率) */
const IMAGE_TOKEN_ESTIMATE = 1020;

/** 每个工具调用的固定 token 估算值 */
const TOOL_CALL_OVERHEAD = 10;

/**
 * 估算文本的 token 数量
 * 轻量方案: 字母文字约 4 字符/token，中文约 1.5 字符/token
 * 这里使用统一的 length/4 估算
 */
function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 计算消息中所有 part 的 token 估算值
 */
function countPartsTokens(
  parts: ReadonlyArray<unknown>,
): number {
  let total = 0;

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      total += estimateTextTokens(part.value);
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      // 工具调用: 函数名 + 参数 JSON
      total += estimateTextTokens(part.name);
      try {
        total += estimateTextTokens(JSON.stringify(part.input ?? {}));
      } catch {
        total += 20; // fallback
      }
      total += TOOL_CALL_OVERHEAD;
    } else if (isImagePart(part)) {
      // 图片: 固定估算
      total += IMAGE_TOKEN_ESTIMATE;
    } else if (isToolResultPart(part)) {
      // 工具结果: 递归计算内容
      if (part.content) {
        total += countPartsTokens(part.content as ReadonlyArray<unknown>);
      }
    }
    // LanguageModelThinkingPart: 可选择计入，暂不处理
  }

  return total;
}

/**
 * 判断是否为工具结果 part（duck typing，与 chatMapper 保持一致）
 */
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
 * 计算字符串或消息的 token 估算值
 * @param textOrMessage 纯文本字符串或 LanguageModelChatRequestMessage
 * @returns 估算的 token 数量
 */
export function countTokens(
  textOrMessage: string | vscode.LanguageModelChatRequestMessage,
): number {
  if (typeof textOrMessage === "string") {
    return estimateTextTokens(textOrMessage);
  }

  let total = BASE_MESSAGE_TOKENS;
  const parts = textOrMessage.content ?? [];
  total += countPartsTokens(parts);
  return total;
}
