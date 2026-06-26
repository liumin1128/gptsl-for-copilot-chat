import { GptslModelConfig } from "../config/modelConfig";
import { StreamPart, StreamThinkingPart } from "./types";

// ---- 公共入口 ----

export function parseModelStream(
  modelConfig: GptslModelConfig,
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamPart> {
  if (modelConfig.apiMode === "anthropic") {
    return parseAnthropicStream(stream);
  }
  return parseOpenAIResponsesStream(stream);
}

// ---- Thinking 缓冲区 ----

class ThinkingBuffer {
  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushDelayMs = 100;
  private pending: string[] = [];

  /** 追加 thinking 文本 */
  add(text: string): void {
    this.buffer += text;
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.doFlush();
      }, this.flushDelayMs);
    }
  }

  /** 立即清空缓冲区，返回待产出的 thinking 文本数组 */
  flush(): string[] {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.doFlush();
    const result = this.pending;
    this.pending = [];
    return result;
  }

  private doFlush(): void {
    if (this.buffer) {
      this.pending.push(this.buffer);
      this.buffer = "";
    }
  }
}

/** 从 ThinkingBuffer 中取出所有待产出的 thinking 并 yield */
async function* yieldThinkingFromBuffer(
  buf: ThinkingBuffer,
): AsyncGenerator<StreamPart> {
  const parts = buf.flush();
  for (const text of parts) {
    yield { type: "thinking", text };
  }
}

// ---- OpenAI Responses API 流解析 ----

async function* parseOpenAIResponsesStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamPart> {
  const toolCallBuffers = new Map<
    number,
    { id?: string; name?: string; args: string }
  >();
  const completedIndices = new Set<number>();
  const thinkingBuf = new ThinkingBuffer();

  for await (const line of readSseDataLines(stream)) {
    const payload = safeJsonParse(line);
    if (!payload) {
      continue;
    }

    const eventType = typeof payload.type === "string" ? payload.type : "";

    switch (eventType) {
      // ---- 文本 ----
      case "response.output_text.delta": {
        const delta = typeof payload.delta === "string" ? payload.delta : "";
        if (delta) {
          const { text, thinkingParts } = extractXmlThinkBlocks(delta);
          for (const tp of thinkingParts) {
            thinkingBuf.add(tp);
          }
          yield* yieldThinkingFromBuffer(thinkingBuf);
          if (text) {
            yield { type: "text", text };
          }
        }
        break;
      }

      case "response.output_text.done": {
        const text = typeof payload.text === "string" ? payload.text : "";
        if (text) {
          const { text: cleanText, thinkingParts } =
            extractXmlThinkBlocks(text);
          for (const tp of thinkingParts) {
            thinkingBuf.add(tp);
          }
          yield* yieldThinkingFromBuffer(thinkingBuf);
          if (cleanText) {
            yield { type: "text", text: cleanText };
          }
        }
        break;
      }

      // ---- Thinking/Reasoning ----
      case "response.reasoning.delta":
      case "response.reasoning_text.delta":
      case "response.reasoning_summary.delta":
      case "response.reasoning_summary_text.delta": {
        const delta = extractReasoningText(payload);
        if (delta) {
          thinkingBuf.add(delta);
          yield* yieldThinkingFromBuffer(thinkingBuf);
        }
        break;
      }

      case "response.reasoning.done":
      case "response.reasoning_text.done":
      case "response.reasoning_summary.done":
      case "response.reasoning_summary_text.done": {
        yield* yieldThinkingFromBuffer(thinkingBuf);
        break;
      }

      // ---- 工具调用 ----
      case "response.function_call_arguments.delta": {
        const idx =
          typeof payload.output_index === "number" ? payload.output_index : 0;
        if (completedIndices.has(idx)) {
          break;
        }

        const callId =
          typeof payload.call_id === "string" ? payload.call_id : undefined;
        const name = typeof payload.name === "string" ? payload.name : "";
        const delta = typeof payload.delta === "string" ? payload.delta : "";

        const buf = toolCallBuffers.get(idx) ?? { args: "" };
        if (!buf.id && callId) {
          buf.id = callId;
        }
        if (!buf.name && name) {
          buf.name = name;
        }
        buf.args += delta;
        toolCallBuffers.set(idx, buf);

        const emitted = tryEmitToolCall(
          idx,
          buf,
          toolCallBuffers,
          completedIndices,
        );
        if (emitted) {
          yield emitted;
        }
        break;
      }

      case "response.function_call_arguments.done": {
        const idx =
          typeof payload.output_index === "number" ? payload.output_index : 0;
        if (completedIndices.has(idx)) {
          break;
        }

        const callId =
          typeof payload.call_id === "string" ? payload.call_id : undefined;
        const name = typeof payload.name === "string" ? payload.name : "";
        const args =
          typeof payload.arguments === "string" ? payload.arguments : "";

        const buf = toolCallBuffers.get(idx) ?? { args: "" };
        if (!buf.id && callId) {
          buf.id = callId;
        }
        if (!buf.name && name) {
          buf.name = name;
        }
        if (args) {
          buf.args = args;
        }

        const part = buildToolCallPart(buf);
        if (part) {
          toolCallBuffers.delete(idx);
          completedIndices.add(idx);
          yield part;
        }
        break;
      }

      case "response.output_item.done": {
        const item = payload.item as Record<string, unknown> | undefined;
        if (item && item.type === "function_call") {
          const idx =
            typeof item.output_index === "number" ? item.output_index : 0;
          if (!completedIndices.has(idx)) {
            const part = buildToolCallPart({
              id: typeof item.call_id === "string" ? item.call_id : undefined,
              name: typeof item.name === "string" ? item.name : "",
              args: typeof item.arguments === "string" ? item.arguments : "{}",
            });
            if (part) {
              completedIndices.add(idx);
              yield part;
            }
          }
        }
        break;
      }
    }
  }

  // 流结束，清空缓冲区
  yield* yieldThinkingFromBuffer(thinkingBuf);
  for (const [, buf] of toolCallBuffers) {
    const part = buildToolCallPart(buf);
    if (part) {
      yield part;
    }
  }
}

// ---- Anthropic Messages API 流解析 ----

async function* parseAnthropicStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamPart> {
  const toolCallBuffers = new Map<
    number,
    { id?: string; name?: string; args: string }
  >();
  const completedIndices = new Set<number>();
  const thinkingBuf = new ThinkingBuffer();

  for await (const line of readSseDataLines(stream)) {
    const payload = safeJsonParse(line);
    if (!payload) {
      continue;
    }

    const eventType = typeof payload.type === "string" ? payload.type : "";

    switch (eventType) {
      case "content_block_delta": {
        const delta = payload.delta as Record<string, unknown> | undefined;
        if (!delta) {
          break;
        }

        if (delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text", text: delta.text };
        } else if (
          delta.type === "input_json_delta" &&
          typeof delta.partial_json === "string"
        ) {
          const idx = typeof payload.index === "number" ? payload.index : 0;
          if (completedIndices.has(idx)) {
            break;
          }

          const buf = toolCallBuffers.get(idx) ?? { args: "" };
          buf.args += delta.partial_json;
          toolCallBuffers.set(idx, buf);

          const emitted = tryEmitToolCall(
            idx,
            buf,
            toolCallBuffers,
            completedIndices,
          );
          if (emitted) {
            yield emitted;
          }
        } else if (
          delta.type === "thinking_delta" &&
          typeof delta.thinking === "string"
        ) {
          thinkingBuf.add(delta.thinking);
          yield* yieldThinkingFromBuffer(thinkingBuf);
        }
        break;
      }

      case "content_block_start": {
        const block = payload.content_block as
          | Record<string, unknown>
          | undefined;
        if (block && block.type === "tool_use") {
          const idx = typeof payload.index === "number" ? payload.index : 0;
          toolCallBuffers.set(idx, {
            id: typeof block.id === "string" ? block.id : undefined,
            name: typeof block.name === "string" ? block.name : "",
            args: "",
          });
        } else if (
          block &&
          block.type === "thinking" &&
          typeof block.thinking === "string"
        ) {
          thinkingBuf.add(block.thinking);
          yield* yieldThinkingFromBuffer(thinkingBuf);
        }
        break;
      }

      case "content_block_stop":
      case "message_stop": {
        yield* yieldThinkingFromBuffer(thinkingBuf);
        for (const [idx, buf] of toolCallBuffers) {
          if (completedIndices.has(idx)) {
            continue;
          }
          const part = buildToolCallPart(buf);
          if (part) {
            completedIndices.add(idx);
            yield part;
          }
        }
        break;
      }
    }
  }

  // 流结束，清空缓冲区
  yield* yieldThinkingFromBuffer(thinkingBuf);
  for (const [, buf] of toolCallBuffers) {
    const part = buildToolCallPart(buf);
    if (part) {
      yield part;
    }
  }
}

// ---- 通用工具方法 ----

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function tryEmitToolCall(
  idx: number,
  buf: { id?: string; name?: string; args: string },
  buffers: Map<number, { id?: string; name?: string; args: string }>,
  completed: Set<number>,
): StreamPart | null {
  if (!buf.name || !buf.args) {
    return null;
  }
  if (!isCompleteJson(buf.args)) {
    return null;
  }
  buffers.delete(idx);
  completed.add(idx);
  return buildToolCallPart(buf);
}

function buildToolCallPart(buf: {
  id?: string;
  name?: string;
  args: string;
}): StreamPart | null {
  if (!buf.name) {
    return null;
  }
  const args = buf.args.trim() || "{}";
  if (!isCompleteJson(args)) {
    return null;
  }
  return {
    type: "tool_call",
    callId:
      buf.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: buf.name,
    arguments: args,
  };
}

function isCompleteJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// ---- Thinking/Reasoning 辅助 ----

/**
 * 从 payload 中提取 reasoning 文本
 * 支持多种字段: delta, text, reasoning, summary
 */
function extractReasoningText(payload: Record<string, unknown>): string {
  const candidates = [
    payload.delta,
    payload.text,
    payload.reasoning,
    payload.summary,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      // 过滤掉 reasoning config 值 (high/medium/low 等)
      if (/^(high|medium|low|none|auto)$/i.test(c.trim())) {
        continue;
      }
      return c;
    }
  }
  return "";
}

/**
 * 从文本中提取 XML <think>...</think> 块
 * 返回纯净文本和 thinking 内容数组
 */
function extractXmlThinkBlocks(input: string): {
  text: string;
  thinkingParts: string[];
} {
  const THINK_START = "<think>";
  const THINK_END = "</think>";

  if (!input.includes(THINK_START)) {
    return { text: input, thinkingParts: [] };
  }

  const thinkingParts: string[] = [];
  let text = "";
  let remaining = input;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf(THINK_START);
    if (startIdx === -1) {
      text += remaining;
      break;
    }

    // 起始标签之前的文本
    text += remaining.slice(0, startIdx);
    remaining = remaining.slice(startIdx + THINK_START.length);

    // 查找结束标签
    const endIdx = remaining.indexOf(THINK_END);
    if (endIdx === -1) {
      // 未闭合的 think 标签，全部当作 thinking
      thinkingParts.push(remaining);
      break;
    }

    thinkingParts.push(remaining.slice(0, endIdx));
    remaining = remaining.slice(endIdx + THINK_END.length);
  }

  return { text, thinkingParts };
}

// ---- SSE 行读取 ----

async function* readSseDataLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

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

  if (!trimmed.startsWith("data:")) {
    return undefined;
  }

  const data = trimmed.slice("data:".length).trim();
  if (!data || data === "[DONE]") {
    return undefined;
  }

  return data;
}
