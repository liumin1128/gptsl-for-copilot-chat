import { GptslModelConfig } from '../config/modelConfig';
import { parseAnthropicStream } from './sseParser';
import { parseOpenAIResponsesStream } from './sseParser';

export function parseModelStream(
  modelConfig: GptslModelConfig,
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  if (modelConfig.apiMode === 'anthropic') {
    return parseAnthropicStream(stream);
  }

  return parseOpenAIResponsesStream(stream);
}
