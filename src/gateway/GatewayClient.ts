import * as vscode from "vscode";
import { GptslModelConfig } from "../config/modelConfig";
import { resolveVersionedBaseUrl } from "../config/baseUrl";
import { toOpenAIResponsesInput, toAnthropicMessages } from "./chatMapper";
import {
  OpenAIResponsesInputItem,
  OpenAIResponsesToolDef,
  AnthropicMessage,
  AnthropicToolDef,
} from "./types";
import { createRetryConfig, executeWithRetry } from "../utils/retry";

const DEFAULT_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
};

export class GatewayClient {
  async streamModelResponse(
    apiKey: string,
    baseUrl: string,
    modelConfig: GptslModelConfig,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const versionedBaseUrl = resolveVersionedBaseUrl(baseUrl);
    if (!versionedBaseUrl) {
      throw new Error(
        "Set gptslForCopilotChat.baseUrl before using GPTSL models.",
      );
    }

    if (modelConfig.apiMode === "anthropic") {
      return this.sendAnthropicRequest(
        apiKey,
        versionedBaseUrl,
        modelConfig,
        messages,
        options,
      );
    }

    return this.sendOpenAIResponsesRequest(
      apiKey,
      versionedBaseUrl,
      modelConfig,
      messages,
      options,
    );
  }

  private async sendOpenAIResponsesRequest(
    apiKey: string,
    baseUrl: string,
    modelConfig: GptslModelConfig,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const { input, instructions } = toOpenAIResponsesInput(messages);
    const tools = this.convertToOpenAIResponsesTools(options);

    const body: Record<string, unknown> = {
      model: modelConfig.id,
      input,
      stream: true,
    };

    if (instructions) {
      body.instructions = instructions;
    }
    if (modelConfig.temperature !== undefined) {
      body.temperature = modelConfig.temperature;
    }
    if (modelConfig.max_tokens !== undefined) {
      body.max_output_tokens = modelConfig.max_tokens;
    }
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice =
        options.toolMode === vscode.LanguageModelChatToolMode.Required &&
        tools.length === 1
          ? { type: "function", name: tools[0].name }
          : "auto";
    }

    const retryConfig = createRetryConfig();

    return executeWithRetry(async () => {
      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `GPTSL chat request failed: [${response.status}] ${response.statusText}${detail ? ` - ${detail}` : ""}`,
        );
      }

      return response.body;
    }, retryConfig);
  }

  private async sendAnthropicRequest(
    apiKey: string,
    baseUrl: string,
    modelConfig: GptslModelConfig,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const { messages: anthropicMessages, system } =
      toAnthropicMessages(messages);
    const tools = this.convertToAnthropicTools(options);

    const body: Record<string, unknown> = {
      model: modelConfig.id,
      messages: anthropicMessages,
      stream: true,
    };

    if (system) {
      body.system = system;
    }
    if (modelConfig.temperature !== undefined) {
      body.temperature = modelConfig.temperature;
    }
    if (modelConfig.max_tokens !== undefined) {
      body.max_tokens = modelConfig.max_tokens;
    }
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = { type: "auto" };
    }

    const retryConfig = createRetryConfig();

    return executeWithRetry(async () => {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `GPTSL chat request failed: [${response.status}] ${response.statusText}${detail ? ` - ${detail}` : ""}`,
        );
      }

      return response.body;
    }, retryConfig);
  }

  private convertToOpenAIResponsesTools(
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): OpenAIResponsesToolDef[] {
    const tools = options.tools ?? [];
    return tools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description:
        typeof t.description === "string" ? t.description : undefined,
      parameters:
        (t.inputSchema as Record<string, unknown> | undefined) ??
        DEFAULT_INPUT_SCHEMA,
    }));
  }

  private convertToAnthropicTools(
    options: vscode.ProvideLanguageModelChatResponseOptions,
  ): AnthropicToolDef[] {
    const tools = options.tools ?? [];
    return tools.map((t) => ({
      name: t.name,
      description:
        typeof t.description === "string" ? t.description : undefined,
      input_schema:
        (t.inputSchema as Record<string, unknown> | undefined) ??
        DEFAULT_INPUT_SCHEMA,
    }));
  }
}
