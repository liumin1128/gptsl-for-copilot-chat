import { GptslModelConfig } from '../config/modelConfig';
import { resolveVersionedBaseUrl } from '../config/baseUrl';
import { ChatMessage } from './types';

export class GatewayClient {
  async streamModelResponse(
    apiKey: string,
    baseUrl: string,
    modelConfig: GptslModelConfig,
    messages: ChatMessage[]
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(this.getResponseUrl(baseUrl, modelConfig), {
      method: 'POST',
      headers: this.buildHeaders(apiKey, modelConfig),
      body: JSON.stringify(this.buildRequestBody(modelConfig, messages))
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(`GPTSL chat request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }

    return response.body;
  }

  private buildHeaders(apiKey: string, modelConfig?: GptslModelConfig): Record<string, string> {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    if (modelConfig?.apiMode === 'anthropic') {
      return {
        ...headers,
        'anthropic-version': '2023-06-01'
      };
    }

    return headers;
  }

  private getResponseUrl(baseUrl: string, modelConfig: GptslModelConfig): string {
    const versionedBaseUrl = resolveVersionedBaseUrl(baseUrl);
    if (!versionedBaseUrl) {
      throw new Error('Set gptslForCopilotChat.baseUrl before using GPTSL models.');
    }

    if (modelConfig.apiMode === 'anthropic') {
      return `${versionedBaseUrl}/messages`;
    }

    return `${versionedBaseUrl}/responses`;
  }

  private buildRequestBody(modelConfig: GptslModelConfig, messages: ChatMessage[]): unknown {
    if (modelConfig.apiMode === 'anthropic') {
      return {
        model: modelConfig.id,
        messages: messages.filter((message) => message.role !== 'system'),
        stream: true,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.max_tokens
      };
    }

    return {
      model: modelConfig.id,
      input: messages,
      stream: true,
      temperature: modelConfig.temperature,
      max_output_tokens: modelConfig.max_tokens
    };
  }
}
