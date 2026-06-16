import * as vscode from 'vscode';

export function extractTextFromParts(parts: ReadonlyArray<unknown>): string {
  return parts.map((part) => (isTextPart(part) ? part.value : '')).join('');
}

export function extractTextFromRequestMessage(message: vscode.LanguageModelChatRequestMessage): string {
  return extractTextFromParts(message.content);
}

function isTextPart(part: unknown): part is vscode.LanguageModelTextPart {
  return typeof part === 'object' && part !== null && 'value' in part && typeof part.value === 'string';
}
