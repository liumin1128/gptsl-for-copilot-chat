const VERSION_PATH_PATTERN = /\/v\d+$/i;

export function normalizeBaseUrl(baseUrl: string): string | undefined {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/$/, '');
  return trimmedBaseUrl || undefined;
}

export function resolveVersionedBaseUrl(baseUrl: string): string | undefined {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return undefined;
  }

  return VERSION_PATH_PATTERN.test(normalizedBaseUrl)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v1`;
}

export function resolveUsageBaseUrl(baseUrl: string): string | undefined {
  return normalizeBaseUrl(baseUrl)?.replace(VERSION_PATH_PATTERN, '');
}
