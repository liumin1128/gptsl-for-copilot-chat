import * as vscode from "vscode";
import { isProviderConfig, GptslModelConfig } from "../config/modelConfig";
import { getApiKey, getBaseUrl, getModelConfigs } from "../config/settings";
import { GatewayClient } from "../gateway/GatewayClient";
import { parseModelStream } from "../gateway/streamParser";
import { extractTextFromRequestMessage } from "../gateway/textParts";
import { toLanguageModelInfo } from "./modelInfo";

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
