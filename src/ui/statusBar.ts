import * as vscode from 'vscode';
import {
  GPTSL_API_KEY_SETTING,
  GPTSL_BASE_URL_SETTING,
  GPTSL_MODELS_SETTING,
  GPTSL_OPEN_SETTINGS_COMMAND,
  GPTSL_REFRESH_USAGE_COMMAND,
  GPTSL_TOGGLE_USAGE_DISPLAY_MODE_COMMAND,
  GPTSL_USAGE_DISPLAY_MODE_SETTING,
  LEGACY_GPTSL_API_KEY_SETTING
} from '../config/constants';
import { resolveUsageBaseUrl } from '../config/baseUrl';
import { getApiKey, getBaseUrl } from '../config/settings';
import {
  buildProgressBar,
  calculateUsagePercentage,
  formatBudgetLimit,
  formatDateTime,
  formatKeyStatus,
  formatPercentage,
  formatSpend,
  getProgressRing
} from '../usage/format';
import { fetchUsageInfo, UsageInfo } from '../usage/usageClient';

type UsageDisplayMode = 'percentage' | 'amount';
type MissingSetting = 'apiKey' | 'baseUrl';

export class UsageStatusBarController implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private disposed = false;
  private refreshToken = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem('gptsl.usageStatusBar', vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.name = 'GPTSL Usage';
    this.statusBarItem.command = GPTSL_REFRESH_USAGE_COMMAND;
    this.statusBarItem.show();
  }

  async refresh(): Promise<void> {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const missingSettings = getMissingSettings(apiKey, baseUrl);

    if (missingSettings.length > 0) {
      this.showMissingSettings(missingSettings);
      await vscode.commands.executeCommand(GPTSL_OPEN_SETTINGS_COMMAND);
      return;
    }

    const usageBaseUrl = resolveUsageBaseUrl(baseUrl);
    if (!usageBaseUrl) {
      this.showMissingSettings(['baseUrl']);
      await vscode.commands.executeCommand(GPTSL_OPEN_SETTINGS_COMMAND);
      return;
    }

    const currentToken = ++this.refreshToken;
    this.showLoading();

    try {
      const usage = await fetchUsageInfo(apiKey, usageBaseUrl);

      if (this.shouldIgnore(currentToken)) {
        return;
      }

      this.showUsage(usage);
    } catch (error) {
      if (this.shouldIgnore(currentToken)) {
        return;
      }

      this.showError(error);
    }
  }

  updateFromConfiguration(): void {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const missingSettings = getMissingSettings(apiKey, baseUrl);

    if (missingSettings.length === 0) {
      void this.refresh();
      return;
    }

    this.refreshToken++;
    this.showMissingSettings(missingSettings);
  }

  dispose(): void {
    this.disposed = true;
    this.statusBarItem.dispose();
  }

  private showMissingSettings(missingSettings: MissingSetting[]): void {
    this.statusBarItem.text = `$(gear) ${formatMissingSettingsText(missingSettings)}`;
    this.statusBarItem.tooltip = buildMissingSettingsTooltip(missingSettings);
  }

  private showLoading(): void {
    this.statusBarItem.text = '$(sync~spin) Usage';
    this.statusBarItem.tooltip = 'Refreshing GPTSL usage';
  }

  private showUsage(usage: UsageInfo): void {
    const displayMode = getUsageDisplayMode();
    const percentage = calculateUsagePercentage(usage.spend, usage.budgetLimit);

    this.statusBarItem.text = buildStatusBarText(usage, displayMode, percentage);
    this.statusBarItem.tooltip = buildUsageTooltip(usage, displayMode, percentage);
  }

  private showError(error: unknown): void {
    this.statusBarItem.text = '$(warning) Usage';
    this.statusBarItem.tooltip = buildErrorTooltip(error);
  }

  private shouldIgnore(token: number): boolean {
    return this.disposed || token !== this.refreshToken;
  }
}

export function registerUsageStatusBar(context: vscode.ExtensionContext): void {
  const controller = new UsageStatusBarController();

  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand(GPTSL_REFRESH_USAGE_COMMAND, () => controller.refresh()),
    vscode.commands.registerCommand(GPTSL_TOGGLE_USAGE_DISPLAY_MODE_COMMAND, async () => {
      const nextMode = getUsageDisplayMode() === 'amount' ? 'percentage' : 'amount';
      await setUsageDisplayMode(nextMode);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(GPTSL_API_KEY_SETTING)
        || event.affectsConfiguration(GPTSL_BASE_URL_SETTING)
        || event.affectsConfiguration(LEGACY_GPTSL_API_KEY_SETTING)
        || event.affectsConfiguration(GPTSL_MODELS_SETTING)
        || event.affectsConfiguration(GPTSL_USAGE_DISPLAY_MODE_SETTING)
      ) {
        controller.updateFromConfiguration();
      }
    })
  );

  controller.updateFromConfiguration();
}

function getUsageDisplayMode(): UsageDisplayMode {
  const mode = vscode.workspace.getConfiguration().get<string>(GPTSL_USAGE_DISPLAY_MODE_SETTING, 'percentage');
  return mode === 'amount' ? 'amount' : 'percentage';
}

async function setUsageDisplayMode(mode: UsageDisplayMode): Promise<void> {
  await vscode.workspace
    .getConfiguration()
    .update(GPTSL_USAGE_DISPLAY_MODE_SETTING, mode, vscode.ConfigurationTarget.Global);
}

function getMissingSettings(apiKey: string, baseUrl: string): MissingSetting[] {
  const missingSettings: MissingSetting[] = [];

  if (!apiKey) {
    missingSettings.push('apiKey');
  }

  if (!baseUrl) {
    missingSettings.push('baseUrl');
  }

  return missingSettings;
}

function formatMissingSettingsText(missingSettings: MissingSetting[]): string {
  if (missingSettings.length === 2) {
    return 'Set API Key & Base URL';
  }

  return missingSettings[0] === 'apiKey' ? 'Set API Key' : 'Set Base URL';
}

function buildMissingSettingsTooltip(missingSettings: MissingSetting[]): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.isTrusted = {
    enabledCommands: [GPTSL_OPEN_SETTINGS_COMMAND]
  };
  tooltip.supportThemeIcons = true;
  tooltip.appendMarkdown(`**${formatMissingSettingsText(missingSettings)}**\n\n`);
  tooltip.appendMarkdown('Configure the required GPTSL settings before refreshing usage.\n\n');
  tooltip.appendMarkdown(`[Open settings](command:${GPTSL_OPEN_SETTINGS_COMMAND})`);

  return tooltip;
}

function buildStatusBarText(
  usage: UsageInfo,
  displayMode: UsageDisplayMode,
  percentage: number | undefined
): string {
  if (displayMode === 'amount') {
    return `$(dashboard) ${formatSpend(usage.spend)}`;
  }

  return `${getProgressRing(percentage)} ${formatPercentage(percentage)}`;
}

function buildUsageTooltip(
  usage: UsageInfo,
  displayMode: UsageDisplayMode,
  percentage: number | undefined
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.isTrusted = {
    enabledCommands: [
      GPTSL_OPEN_SETTINGS_COMMAND,
      GPTSL_REFRESH_USAGE_COMMAND,
      GPTSL_TOGGLE_USAGE_DISPLAY_MODE_COMMAND
    ]
  };
  tooltip.supportThemeIcons = true;
  tooltip.appendMarkdown('**GPTSL Usage**\n\n');

  if (usage.userName) {
    tooltip.appendMarkdown(`- User: \`${usage.userName}\`\n`);
  }

  tooltip.appendMarkdown(`- Status: \`${formatKeyStatus(usage.blocked)}\`\n`);
  tooltip.appendMarkdown(`- Current usage: \`${formatSpend(usage.spend)}\`\n`);

  if (usage.budgetLimit !== undefined) {
    tooltip.appendMarkdown(`- Budget limit: \`${formatBudgetLimit(usage.budgetLimit, usage.budgetDuration)}\`\n`);
  }

  tooltip.appendMarkdown(`- Percentage: \`${formatPercentage(percentage)}\`\n`);
  tooltip.appendMarkdown(`- Progress: \`${buildProgressBar(percentage)} ${formatPercentage(percentage)}\`\n`);

  if (usage.budgetResetAt) {
    tooltip.appendMarkdown(`- Budget reset: \`${formatDateTime(usage.budgetResetAt)}\`\n`);
  }

  tooltip.appendMarkdown(`- Expires: \`${usage.expiresAt ? formatDateTime(usage.expiresAt) : 'Never'}\`\n`);
  tooltip.appendMarkdown(`- Display mode: \`${displayMode}\`\n`);

  if (usage.keyName) {
    tooltip.appendMarkdown(`- Key: \`${usage.keyName}\`\n`);
  }

  if (usage.keyAlias) {
    tooltip.appendMarkdown(`- Alias: \`${usage.keyAlias}\`\n`);
  }

  if (usage.lastActive) {
    tooltip.appendMarkdown(`- Last active: \`${formatDateTime(usage.lastActive)}\`\n`);
  }

  if (usage.updatedAt) {
    tooltip.appendMarkdown(`- Updated at: \`${formatDateTime(usage.updatedAt)}\`\n`);
  }

  tooltip.appendMarkdown('\n---\n');
  tooltip.appendMarkdown(`[Refresh](command:${GPTSL_REFRESH_USAGE_COMMAND})`);
  tooltip.appendMarkdown(' · ');
  tooltip.appendMarkdown(`[Open settings](command:${GPTSL_OPEN_SETTINGS_COMMAND})`);
  tooltip.appendMarkdown(' · ');
  tooltip.appendMarkdown(`[Toggle display](command:${GPTSL_TOGGLE_USAGE_DISPLAY_MODE_COMMAND})`);

  return tooltip;
}

function buildErrorTooltip(error: unknown): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.isTrusted = {
    enabledCommands: [GPTSL_OPEN_SETTINGS_COMMAND, GPTSL_REFRESH_USAGE_COMMAND]
  };
  tooltip.supportThemeIcons = true;
  tooltip.appendMarkdown(`**GPTSL usage fetch failed**\n\n${getErrorMessage(error)}\n\n`);
  tooltip.appendMarkdown(`[Retry](command:${GPTSL_REFRESH_USAGE_COMMAND})`);
  tooltip.appendMarkdown(' · ');
  tooltip.appendMarkdown(`[Open settings](command:${GPTSL_OPEN_SETTINGS_COMMAND})`);

  return tooltip;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
