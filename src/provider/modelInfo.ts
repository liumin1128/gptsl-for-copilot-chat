import * as vscode from 'vscode';
import { GptslModelConfig } from '../config/modelConfig';
import { GPTSL_DISPLAY_NAME } from '../config/constants';

const DEFAULT_MAX_INPUT_TOKENS = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

export function toLanguageModelInfo(model: GptslModelConfig): vscode.LanguageModelChatInformation {
  return {
    id: model.id,
    name: model.id,
    family: inferFamily(model.id),
    version: inferVersion(model.id),
    maxInputTokens: model.context_length ?? DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: model.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    tooltip: `${GPTSL_DISPLAY_NAME}: ${model.id}`,
    detail: inferProvider(model),
    capabilities: {
      imageInput: model.vision,
      toolCalling: true
    }
  };
}

function inferFamily(modelId: string): string {
  const normalized = modelId.toLowerCase();

  if (normalized.includes('claude') || normalized.includes('anthropic')) {
    return 'claude';
  }

  if (normalized.includes('gemini')) {
    return 'gemini';
  }

  if (normalized.includes('qwen')) {
    return 'qwen';
  }

  if (normalized.includes('deepseek')) {
    return 'deepseek';
  }

  if (normalized.includes('nova') || normalized.includes('bedrock')) {
    return 'bedrock';
  }

  if (normalized.includes('gpt') || normalized.includes('codex')) {
    return 'gpt';
  }

  return 'gptsl';
}

function inferVersion(modelId: string): string {
  return modelId.match(/\d{8}/)?.[0] ?? 'gateway';
}

function inferProvider(model: GptslModelConfig): string {
  if (model.apiMode === 'anthropic') {
    return 'SIA';
  }

  return 'SIAGPT';
}
