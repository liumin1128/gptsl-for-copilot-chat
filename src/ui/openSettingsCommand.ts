import * as vscode from 'vscode';
import { GPTSL_API_KEY_SETTING, GPTSL_BASE_URL_SETTING } from '../config/constants';
import { getApiKey, getBaseUrl, setApiKey, setBaseUrl } from '../config/settings';

export async function openSettingsWithApiKeyPrompt(): Promise<void> {
  const needsBaseUrl = !getBaseUrl();
  const needsApiKey = !getApiKey();

  if (needsBaseUrl) {
    const baseUrl = await vscode.window.showInputBox({
      title: 'GPTSL Base URL',
      prompt: 'Enter the base URL for GPTSL AI Gateway.',
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : 'Base URL is required.'
    });

    if (!baseUrl) {
      return;
    }

    await setBaseUrl(baseUrl);
  }

  if (needsApiKey) {
    const apiKey = await vscode.window.showInputBox({
      title: 'GPTSL API Key',
      prompt: 'Enter the API key for GPTSL AI Gateway.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : 'API key is required.'
    });

    if (!apiKey) {
      return;
    }

    await setApiKey(apiKey);
  }

  if (needsBaseUrl || needsApiKey) {
    await vscode.window.showInformationMessage('GPTSL settings saved.');
    return;
  }

  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    `@id:${GPTSL_API_KEY_SETTING} @id:${GPTSL_BASE_URL_SETTING} @id:gptslForCopilotChat.models`
  );
}
