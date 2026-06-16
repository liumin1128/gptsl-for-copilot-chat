export async function* parseOpenAIResponsesStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of readSseDataLines(stream)) {
    if (line === '[DONE]') {
      continue;
    }

    const payload = JSON.parse(line) as {
      type?: string;
      delta?: string;
      output_text?: string;
    };

    if (payload.type === 'response.output_text.delta' && payload.delta) {
      yield payload.delta;
    } else if (payload.output_text) {
      yield payload.output_text;
    }
  }
}

export async function* parseAnthropicStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of readSseDataLines(stream)) {
    const payload = JSON.parse(line) as {
      type?: string;
      delta?: {
        text?: string;
      };
    };

    if (payload.type === 'content_block_delta' && payload.delta?.text) {
      yield payload.delta.text;
    }
  }
}

async function* readSseDataLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const data = parseDataLine(line);
        if (data) {
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseDataLine(line: string): string | undefined {
  const trimmed = line.trim();

  if (!trimmed.startsWith('data:')) {
    return undefined;
  }

  const data = trimmed.slice('data:'.length).trim();
  if (!data || data === '[DONE]') {
    return undefined;
  }

  return data;
}
