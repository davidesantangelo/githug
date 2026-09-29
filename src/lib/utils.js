import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number for compact display: 1200 -> "1.2k", 3400000 -> "3.4M".
 * Returns "0" for null/undefined so callers can render safely.
 */
export function formatCount(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0"
  const n = Number(num)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(n)
}
