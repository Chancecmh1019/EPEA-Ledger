export function formatCurrency(amount: number): string {
  return (amount < 0 ? '−' : '') + 'NT$' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(Math.abs(amount));
}
