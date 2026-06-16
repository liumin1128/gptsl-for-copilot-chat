import * as vscode from 'vscode';
import {
  GPTSL_API_KEY_SETTING,
  GPTSL_BASE_URL_SETTING,
  GPTSL_MODELS_SETTING,
  GPTSL_OPEN_SETTINGS_COMMAND,
  GPTSL_VENDOR,
  LEGACY_GPTSL_API_KEY_SETTING
} from './config/constants';
import { GatewayClient } from './gateway/GatewayClient';
import { GptslLanguageModelProvider } from './provider/GptslLanguageModelProvider';
import { openSettingsWithApiKeyPrompt } from './ui/openSettingsCommand';
import { registerUsageStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const gatewayClient = new GatewayClient();
  const provider = new GptslLanguageModelProvider(gatewayClient);

  registerUsageStatusBar(context);

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(GPTSL_VENDOR, provider),
    provider,
    vscode.commands.registerCommand(GPTSL_OPEN_SETTINGS_COMMAND, () => openSettingsWithApiKeyPrompt()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(GPTSL_API_KEY_SETTING)
        || event.affectsConfiguration(GPTSL_BASE_URL_SETTING)
        || event.affectsConfiguration(LEGACY_GPTSL_API_KEY_SETTING)
        || event.affectsConfiguration(GPTSL_MODELS_SETTING)
      ) {
        provider.refresh();
      }
    })
  );
}

export function deactivate(): void {}
