import * as vscode from "vscode";
import { GptslModelConfig } from "../config/modelConfig";
import { GPTSL_DISPLAY_NAME } from "../config/constants";

const DEFAULT_MAX_INPUT_TOKENS = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/** 思考深度可选值 */
export type ThinkingEffort = "none" | "high" | "max";

/** Copilot Chat 非公开字段：模型专属配置 schema */
interface ThinkingConfigurationSchema {
  properties: {
    reasoningEffort: {
      type: "string";
      title: string;
      enum: ThinkingEffort[];
      enumItemLabels: string[];
      enumDescriptions: string[];
      default: ThinkingEffort;
      group: string;
    };
  };
}

interface ModelPickerChatInfo extends vscode.LanguageModelChatInformation {
  /** 告诉 Copilot Chat 这是用户自带 Key 的模型，启用配置 UI */
  readonly isBYOK: true;
  /** 允许用户在模型选择器中选择 */
  readonly isUserSelectable: true;
  configurationSchema?: ThinkingConfigurationSchema;
}

export function toLanguageModelInfo(
  model: GptslModelConfig,
): vscode.LanguageModelChatInformation {
  const base: ModelPickerChatInfo = {
    id: model.id,
    name: model.id,
    family: inferFamily(model.id),
    version: inferVersion(model.id),
    maxInputTokens: model.context_length ?? DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: model.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    tooltip: `${GPTSL_DISPLAY_NAME}: ${model.id}`,
    detail: inferProvider(model),
    isBYOK: true,
    isUserSelectable: true,
    capabilities: {
      imageInput: model.vision,
      toolCalling: true,
    },
  };

  if (model.thinking) {
    base.configurationSchema = buildThinkingEffortSchema();
  }

  return base;
}

function buildThinkingEffortSchema(): ThinkingConfigurationSchema {
  return {
    properties: {
      reasoningEffort: {
        type: "string",
        title: "思考深度",
        enum: ["none", "high", "max"],
        enumItemLabels: ["关闭", "高", "最高"],
        enumDescriptions: [
          "不进行深度思考，直接回答",
          "进行较高深度的思考",
          "进行最深度的思考",
        ],
        default: "high",
        group: "navigation",
      },
    },
  };
}

function inferFamily(modelId: string): string {
  const normalized = modelId.toLowerCase();

  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    return "claude";
  }

  if (normalized.includes("gemini")) {
    return "gemini";
  }

  if (normalized.includes("qwen")) {
    return "qwen";
  }

  if (normalized.includes("deepseek")) {
    return "deepseek";
  }

  if (normalized.includes("nova") || normalized.includes("bedrock")) {
    return "bedrock";
  }

  if (normalized.includes("gpt") || normalized.includes("codex")) {
    return "gpt";
  }

  return "gptsl";
}

function inferVersion(modelId: string): string {
  return modelId.match(/\d{8}/)?.[0] ?? "gateway";
}

function inferProvider(model: GptslModelConfig): string {
  if (model.apiMode === "anthropic") {
    return "SIA";
  }

  return "SIAGPT";
}
