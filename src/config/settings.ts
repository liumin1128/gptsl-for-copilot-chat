import * as vscode from 'vscode';
import {
  GPTSL_API_KEY_SETTING,
  GPTSL_BASE_URL_SETTING,
  GPTSL_MODELS_SETTING,
  LEGACY_GPTSL_API_KEY_SETTING
} from './constants';
import { DEFAULT_MODEL_CONFIGS } from './defaultModels';
import { GptslModelConfig, isProviderConfig } from './modelConfig';

export function getApiKey(): string {
  const configuration = vscode.workspace.getConfiguration();
  const apiKey = configuration.get<string>(GPTSL_API_KEY_SETTING, '').trim();
  const legacyApiKey = configuration.get<string>(LEGACY_GPTSL_API_KEY_SETTING, '').trim();

  return apiKey || legacyApiKey;
}

export async function setApiKey(apiKey: string): Promise<void> {
  await vscode.workspace.getConfiguration().update(
    GPTSL_API_KEY_SETTING,
    apiKey.trim(),
    vscode.ConfigurationTarget.Global
  );
}

export function getBaseUrl(): string {
  return vscode.workspace.getConfiguration().get<string>(GPTSL_BASE_URL_SETTING, '').trim();
}

export async function setBaseUrl(baseUrl: string): Promise<void> {
  await vscode.workspace.getConfiguration().update(
    GPTSL_BASE_URL_SETTING,
    baseUrl.trim(),
    vscode.ConfigurationTarget.Global
  );
}

export function getModelConfigs(): GptslModelConfig[] {
  const configuration = vscode.workspace.getConfiguration();
  const models = configuration.get<GptslModelConfig[]>(GPTSL_MODELS_SETTING, []);
  const resolvedModels = models.length > 0 ? models : DEFAULT_MODEL_CONFIGS;

  return resolvedModels
    .filter((config) => !isProviderConfig(config));
}
