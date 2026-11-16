"use client";

import { useEffect, useRef, useState } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 13.5 10 17l8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-gray-900">Comptroller</span>
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-gray-200/80 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

type Tone = "indigo" | "emerald" | "rose" | "amber" | "gray" | "sky" | "violet" | "teal";
const TONES: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/10",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/10",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/10",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/10",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/10",
};

export function Pill({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Smoothly animates a number toward `value`. */
export function useCountUp(value: number, ms = 600) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    from.current = display;
    start.current = null;
    const target = value;
    const base = from.current;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const p = Math.min(1, (t - start.current) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(base + (target - base) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}
