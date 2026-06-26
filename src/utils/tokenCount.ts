import * as vscode from "vscode";
import { isImagePart } from "./imageHelper";

/** 每条消息的基础 token 开销 */
const BASE_MESSAGE_TOKENS = 3;

/** 图片的固定 token 估算值 (参考 OpenAI vision 成本: 每张 ~1020 token 高分辨率) */
const IMAGE_TOKEN_ESTIMATE = 1020;

/** 每个工具调用的固定 token 估算值 */
const TOOL_CALL_OVERHEAD = 10;

/** ASCII（拉丁文字）约 4 字符/token */
const CHARS_PER_TOKEN_ASCII = 4;

/** CJK（中日韩）约 1.5 字符/token */
const CHARS_PER_TOKEN_CJK = 1.5;

/** 匹配 CJK 统一表意文字及常见中日韩字符范围 */
const CJK_REGEX =
  /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

/**
 * 估算文本的 token 数量
 * 区分 CJK 与 ASCII：CJK 约 1.5 字符/token，其余约 4 字符/token
 */
function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }
  const cjkCount = (text.match(CJK_REGEX) ?? []).length;
  const asciiCount = text.length - cjkCount;
  return Math.ceil(
    cjkCount / CHARS_PER_TOKEN_CJK + asciiCount / CHARS_PER_TOKEN_ASCII,
  );
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
