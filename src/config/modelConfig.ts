export type ApiMode = "openai-responses" | "anthropic";

export interface GptslModelConfig {
  id: string;
  owned_by?: string;
  configId?: string;
  apiMode: ApiMode;
  context_length?: number;
  max_tokens?: number;
  vision?: boolean;
  thinking?: boolean;
  temperature?: number;
}

export function isProviderConfig(config: GptslModelConfig): boolean {
  return config.id.startsWith("__provider__");
}
