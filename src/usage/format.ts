const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatSpend(spend: number): string {
  if (!Number.isFinite(spend)) {
    return '$--.--';
  }

  return USD_FORMATTER.format(spend);
}

export function calculateUsagePercentage(spend: number, budgetLimit: number | undefined): number | undefined {
  if (!Number.isFinite(spend) || budgetLimit === undefined || budgetLimit <= 0) {
    return undefined;
  }

  return (spend / budgetLimit) * 100;
}

export function formatPercentage(percentage: number | undefined): string {
  if (percentage === undefined || !Number.isFinite(percentage)) {
    return '--%';
  }

  return `${percentage.toFixed(1)}%`;
}

export function getProgressRing(percentage: number | undefined): string {
  if (percentage === undefined || !Number.isFinite(percentage) || percentage <= 0) {
    return '○';
  }

  if (percentage < 25) {
    return '◔';
  }

  if (percentage < 50) {
    return '◑';
  }

  if (percentage < 75) {
    return '◕';
  }

  return '●';
}

export function buildProgressBar(percentage: number | undefined, size = 20): string {
  if (percentage === undefined || !Number.isFinite(percentage) || size <= 0) {
    return `[${'-'.repeat(Math.max(size, 0))}]`;
  }

  const normalizedPercentage = Math.max(0, Math.min(percentage, 100));
  const filledSize = Math.round((normalizedPercentage / 100) * size);
  const emptySize = size - filledSize;

  return `[${'#'.repeat(filledSize)}${'-'.repeat(emptySize)}]`;
}
