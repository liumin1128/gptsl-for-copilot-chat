export interface UsageInfo {
  blocked?: boolean;
  budgetDuration?: string;
  budgetLimit?: number;
  budgetResetAt?: string;
  expiresAt?: string;
  keyAlias?: string;
  keyName?: string;
  lastActive?: string;
  spend: number;
  updatedAt?: string;
  userName?: string;
}

interface ModelBudgetLimit {
  budget_limit?: unknown;
}

interface KeyInfoResponse {
  info?: {
    blocked?: unknown;
    budget_duration?: unknown;
    budget_reset_at?: unknown;
    expires?: unknown;
    key_alias?: unknown;
    key_name?: unknown;
    last_active?: unknown;
    max_budget?: unknown;
    model_max_budget?: unknown;
    spend?: unknown;
    updated_at?: unknown;
  };
}

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchUsageInfo(apiKey: string, baseUrl: string): Promise<UsageInfo> {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/key/info`);
  url.searchParams.set('key', apiKey);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': apiKey
      },
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Usage request failed: HTTP ${response.status}`);
    }

    return parseUsageInfo(await response.json() as KeyInfoResponse);
  } catch (error) {
    throw normalizeFetchError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseUsageInfo(data: KeyInfoResponse): UsageInfo {
  const spend = data.info?.spend;

  if (typeof spend !== 'number' || !Number.isFinite(spend)) {
    throw new Error('Response is missing a valid info.spend value');
  }

  const keyAlias = readString(data.info?.key_alias);

  return {
    blocked: typeof data.info?.blocked === 'boolean' ? data.info.blocked : undefined,
    budgetDuration: readString(data.info?.budget_duration),
    budgetLimit: parseBudgetLimit(data.info?.max_budget, data.info?.model_max_budget),
    budgetResetAt: readString(data.info?.budget_reset_at),
    expiresAt: readString(data.info?.expires),
    keyAlias,
    keyName: readString(data.info?.key_name),
    lastActive: readString(data.info?.last_active),
    spend,
    updatedAt: readString(data.info?.updated_at),
    userName: parseUserName(keyAlias)
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseUserName(keyAlias: string | undefined): string | undefined {
  if (!keyAlias) {
    return undefined;
  }

  const separatorIndex = keyAlias.lastIndexOf(' - ');
  const userName = separatorIndex >= 0 ? keyAlias.slice(separatorIndex + 3) : keyAlias;
  const trimmedUserName = userName.trim();

  return trimmedUserName || undefined;
}

function parseBudgetLimit(maxBudget: unknown, modelMaxBudget: unknown): number | undefined {
  if (typeof maxBudget === 'number' && Number.isFinite(maxBudget)) {
    return maxBudget;
  }

  if (!isRecord(modelMaxBudget)) {
    return undefined;
  }

  const limits = Object.values(modelMaxBudget)
    .map(readModelBudgetLimit)
    .filter((limit): limit is number => limit !== undefined);

  if (limits.length === 0) {
    return undefined;
  }

  return Math.max(...limits);
}

function readModelBudgetLimit(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const budget = (value as ModelBudgetLimit).budget_limit;
  return typeof budget === 'number' && Number.isFinite(budget) ? budget : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeFetchError(error: unknown): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(`Usage request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
  }

  return error instanceof Error ? error : new Error('Unknown usage fetch error');
}
