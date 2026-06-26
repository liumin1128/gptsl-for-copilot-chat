import { RetryConfig } from "../gateway/types";

// ---- 默认重试参数 ----

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 1000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_INTERVAL_MS = 60000;

/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** 可重试的网络错误模式 */
const NETWORK_ERROR_PATTERNS = [
  "fetch failed",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNREFUSED",
  "timeout",
  "TIMEOUT",
  "network error",
  "NetworkError",
];

// ---- 工厂函数 ----

/** 从 VS Code 配置创建重试配置 */
export function createRetryConfig(): RetryConfig {
  // 使用默认值，不需要从配置读取（保持简单）
  return {
    enabled: true,
    max_attempts: RETRY_MAX_ATTEMPTS,
    interval_ms: RETRY_INTERVAL_MS,
  };
}

// ---- 核心重试执行器 ----

/**
 * 带重试逻辑的异步函数执行器
 * @param fn 要执行的异步函数
 * @param retryConfig 重试配置
 * @returns 函数执行结果
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retryConfig: RetryConfig,
): Promise<T> {
  if (!retryConfig.enabled) {
    return await fn();
  }

  const maxAttempts = retryConfig.max_attempts ?? RETRY_MAX_ATTEMPTS;
  const baseIntervalMs = retryConfig.interval_ms ?? RETRY_INTERVAL_MS;
  const retryableStatusCodes = retryConfig.status_codes
    ? [...new Set([...RETRYABLE_STATUS_CODES, ...retryConfig.status_codes])]
    : RETRYABLE_STATUS_CODES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // AbortError (用户取消) 不应重试
      if (lastError.name === "AbortError") {
        throw lastError;
      }

      const isRetryableStatusError = retryableStatusCodes.some((code) =>
        lastError?.message.includes(`[${code}]`),
      );
      const isRetryableNetworkError = NETWORK_ERROR_PATTERNS.some((pattern) =>
        lastError?.message.includes(pattern),
      );
      const isRetryableError =
        isRetryableStatusError || isRetryableNetworkError;

      if (!isRetryableError || attempt === maxAttempts) {
        throw lastError;
      }

      // 指数退避: interval * 2^attempt, 上限 60s
      const delayMs = Math.min(
        baseIntervalMs * Math.pow(RETRY_BACKOFF_FACTOR, attempt),
        RETRY_MAX_INTERVAL_MS,
      );

      console.warn(
        `[GPTSL] Retryable error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts}):`,
        lastError.message,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Retry exhausted");
}
