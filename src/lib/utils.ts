import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return (amount < 0 ? '−' : '') + 'NT$' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(Math.abs(amount));
}

export function safeParseDate(dateStr: string): Date {
  try {
    const d = parseISO(dateStr);
    if (!isNaN(d.getTime())) return d;
  } catch { return new Date(NaN); }
  return new Date(NaN);
}
