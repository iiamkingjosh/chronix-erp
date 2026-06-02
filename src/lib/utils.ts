import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round a monetary amount to 2 decimal places (kobo precision). */
export function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function validateAmount(amount: unknown, field = "amount"): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
    throw new Error(`Invalid ${field}: must be a positive number under ₦100,000,000`);
  }
  return Math.round(n * 100) / 100;
}
