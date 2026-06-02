import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round a monetary amount to 2 decimal places (kobo precision). */
export function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}
