import { GptslModelConfig } from "./modelConfig";

export const DEFAULT_MODEL_CONFIGS: GptslModelConfig[] = [
  {
    id: "GPT5.5",
    context_length: 1_000_000,
    max_tokens: 128_000,
    vision: true,
    thinking: true,
    apiMode: "openai-responses",
  },
  {
    id: "GPT5.4",
    context_length: 1_000_000,
    max_tokens: 128_000,
    vision: true,
    thinking: true,
    apiMode: "openai-responses",
  },
  {
    id: "claude-opus-4-8",
    context_length: 1_000_000,
    max_tokens: 128_000,
    vision: true,
    thinking: true,
    apiMode: "anthropic",
  },
  {
    id: "claude-sonnet-4-6",
    context_length: 200_000,
    max_tokens: 40_960,
    vision: true,
    thinking: true,
    apiMode: "anthropic",
  },
];
