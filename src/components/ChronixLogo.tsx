"use client";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  size?: number;
}

/**
 * Chronix logomark — C-arc + clock hands + circuit branches.
 * Designed for dark backgrounds: white C, orange clock, secondary blue circuit.
 */
export default function ChronixLogo({ className, size = 64 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-label="Chronix logo"
    >
      {/* ── Main C arc ───────────────────────────────────────
          Centre (36,50), radius 27.
          Endpoints at ±55° from horizontal → top (52,28) bottom (52,72).
          Large-arc CCW → sweeps through left side (9 o'clock position).  */}
      <path
        d="M 52 28 A 27 27 0 1 0 52 72"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Clock hands (orange) ─────────────────────────── */}
      {/* 12 o'clock */}
      <line x1="36" y1="50" x2="36" y2="33" stroke="#FF761B" strokeWidth="3.5" strokeLinecap="round"/>
      {/* 3 o'clock — extends toward the C opening / circuit junction */}
      <line x1="36" y1="50" x2="54" y2="50" stroke="#FF761B" strokeWidth="3.5" strokeLinecap="round"/>

      {/* ── Pivot circle ─────────────────────────────────── */}
      <circle cx="36" cy="50" r="3.2" fill="#FF761B"/>
      <circle cx="36" cy="50" r="1.5" fill="#001833"/>

      {/* ── Circuit branches (secondary blue) ────────────── */}

      {/* Branch 1 — arrow pointing right */}
      <line x1="54" y1="37" x2="75" y2="37" stroke="#2472B4" strokeWidth="2.5" strokeLinecap="round"/>
      <path
        d="M 70 32 L 77 37 L 70 42"
        stroke="#2472B4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Branch 2 — step right + hollow circle */}
      <path
        d="M 54 50 L 63 50 L 68 56 L 79 56"
        stroke="#2472B4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="82" cy="56" r="2.5" stroke="#2472B4" strokeWidth="2.5" fill="none"/>

      {/* Branch 3 — step down-right + hollow circle */}
      <path
        d="M 54 63 L 61 63 L 61 72 L 76 72"
        stroke="#2472B4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="79" cy="72" r="2.5" stroke="#2472B4" strokeWidth="2.5" fill="none"/>
    </svg>
  );
}
