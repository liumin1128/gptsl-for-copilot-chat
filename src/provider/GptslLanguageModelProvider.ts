import * as vscode from "vscode";
import { isProviderConfig, GptslModelConfig } from "../config/modelConfig";
import { getApiKey, getBaseUrl, getModelConfigs } from "../config/settings";
import { GatewayClient } from "../gateway/GatewayClient";
import { parseModelStream } from "../gateway/streamParser";
import { extractTextFromRequestMessage } from "../gateway/textParts";
import { toLanguageModelInfo } from "./modelInfo";

/** VS Code proposed API: LanguageModelThinkingPart */
const LanguageModelThinkingPart = (
  vscode as unknown as {
    LanguageModelThinkingPart?: new (
      text: string,
      id: string,
    ) => vscode.LanguageModelResponsePart;
  }
).LanguageModelThinkingPart;

/** Token usage data part MIME type */
const USAGE_MIME_TYPE = "usage";

export class GptslLanguageModelProvider
  implements vscode.LanguageModelChatProvider
{
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private modelCache: vscode.LanguageModelChatInformation[] | undefined;
  private configCache: GptslModelConfig[] | undefined;

  readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeEmitter.event;

  constructor(private readonly gatewayClient: GatewayClient) {}

  refresh(): void {
    this.modelCache = undefined;
    this.configCache = undefined;
    this.onDidChangeEmitter.fire();
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    if (this.modelCache) {
      return this.modelCache;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      if (!options.silent) {
        void vscode.window.showWarningMessage(
          "Set gptslForCopilotChat.apiKey before using GPTSL models.",
        );
      }

      return [];
    }

    if (!getBaseUrl()) {
      if (!options.silent) {
        void vscode.window.showWarningMessage(
          "Set gptslForCopilotChat.baseUrl before using GPTSL models.",
        );
      }

      return [];
    }

    if (token.isCancellationRequested) {
      return [];
    }

    this.configCache = getModelConfigs();
    if (this.configCache.length === 0) {
      if (!options.silent) {
        void vscode.window.showWarningMessage(
          "Configure gptslForCopilotChat.models before using GPTSL models.",
        );
      }

      return [];
    }

    this.modelCache = this.configCache
      .filter((config) => !isProviderConfig(config))
      .map(toLanguageModelInfo);

    return this.modelCache;
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        "Set gptslForCopilotChat.apiKey before using GPTSL models.",
      );
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      throw new Error(
        "Set gptslForCopilotChat.baseUrl before using GPTSL models.",
      );
    }

    const modelConfig = this.getModelConfig(model.id);
    if (!modelConfig) {
      throw new Error(`GPTSL model is not configured: ${model.id}`);
    }

    // Thinking 状态管理
    let currentThinkingId: string | null = null;
    let thinkingBuffer = "";
    let thinkingFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushThinkingBuffer = (): void => {
      if (thinkingFlushTimer) {
        clearTimeout(thinkingFlushTimer);
        thinkingFlushTimer = null;
      }
      if (thinkingBuffer && currentThinkingId && LanguageModelThinkingPart) {
        progress.report(
          new LanguageModelThinkingPart(thinkingBuffer, currentThinkingId),
        );
        thinkingBuffer = "";
      }
    };

    const bufferThinkingContent = (text: string): void => {
      if (!LanguageModelThinkingPart) {
        return;
      }
      if (!currentThinkingId) {
        currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }
      thinkingBuffer += text;
      if (!thinkingFlushTimer) {
        thinkingFlushTimer = setTimeout(flushThinkingBuffer, 100);
      }
    };

    const endThinking = (): void => {
      flushThinkingBuffer();
      if (currentThinkingId && LanguageModelThinkingPart) {
        try {
          progress.report(new LanguageModelThinkingPart("", currentThinkingId));
        } catch {
          /* ignore */
        }
      }
      currentThinkingId = null;
      thinkingBuffer = "";
      if (thinkingFlushTimer) {
        clearTimeout(thinkingFlushTimer);
        thinkingFlushTimer = null;
      }
    };

    try {
      const stream = await this.gatewayClient.streamModelResponse(
        apiKey,
        baseUrl,
        modelConfig,
        messages,
        options,
      );

      for await (const part of parseModelStream(modelConfig, stream)) {
        if (token.isCancellationRequested) {
          return;
        }

        if (part.type === "text") {
          progress.report(new vscode.LanguageModelTextPart(part.text));
        } else if (part.type === "thinking") {
          bufferThinkingContent(part.text);
        } else if (part.type === "tool_call") {
          let parsedArgs: Record<string, unknown>;
          try {
            parsedArgs = JSON.parse(part.arguments);
          } catch {
            parsedArgs = {};
          }
          progress.report(
            new vscode.LanguageModelToolCallPart(
              part.callId,
              part.name,
              parsedArgs,
            ),
          );
        }
      }

      // 流结束，清理 thinking
      endThinking();
    } catch (err) {
      endThinking();
      throw err;
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    const content =
      typeof text === "string" ? text : extractTextFromRequestMessage(text);

    return Math.ceil(content.length / 4);
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private getModelConfig(modelId: string): GptslModelConfig | undefined {
    const configs = this.configCache ?? getModelConfigs();
    return configs.find(
      (config) => config.id === modelId && !isProviderConfig(config),
    );
  }
}
