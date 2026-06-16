import * as vscode from 'vscode';
import { extractTextFromRequestMessage } from './textParts';
import { ChatMessage } from './types';

export function toGatewayMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[]
): ChatMessage[] {
  return messages.map(toChatMessage).filter(Boolean) as ChatMessage[];
}

function toChatMessage(message: vscode.LanguageModelChatRequestMessage): ChatMessage | undefined {
  const content = extractTextFromRequestMessage(message).trim();

  if (!content) {
    return undefined;
  }

  return {
    role: toGatewayRole(message.role),
    content
  };
}

function toGatewayRole(role: vscode.LanguageModelChatMessageRole): ChatMessage['role'] {
  if (role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }

  return 'user';
}
