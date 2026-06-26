import type * as vscode from "vscode";

/** 支持的图片 MIME 类型集合 */
const SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * 判断 part 是否为图片类型的数据 part
 */
export function isImagePart(
  part: unknown,
): part is vscode.LanguageModelDataPart {
  if (!part || typeof part !== "object") {
    return false;
  }
  // LanguageModelDataPart 有 data: Uint8Array 和 mimeType: string 属性
  const maybe = part as { mimeType?: unknown; data?: unknown };
  if (
    typeof maybe.mimeType !== "string" ||
    !(maybe.data instanceof Uint8Array)
  ) {
    return false;
  }
  return SUPPORTED_IMAGE_MIMES.has(maybe.mimeType);
}

/**
 * 将 Uint8Array 转换为 base64 字符串
 */
export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * 将 MIME 类型和 base64 数据转换为 data URL
 */
export function toDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}
