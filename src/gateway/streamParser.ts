import { GptslModelConfig } from "../config/modelConfig";
import { parseModelStream as parseStream } from "./sseParser";
import { StreamPart } from "./types";

export function parseModelStream(
  modelConfig: GptslModelConfig,
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamPart> {
  return parseStream(modelConfig, stream);
}
