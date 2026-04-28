"use client";

import { useEffect, useRef, useState } from "react";
import type { MonthRange } from "@/lib/types";

const YEARS = ["all", "pre-2023", "2023", "2024", "2025", "2026"] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function labelFor(y: string): string {
  if (y === "all") return "All";
  if (y === "pre-2023") return "Pre-2023";
  return y;
}

function rangeLabel(r: MonthRange): string {
  return r.start === r.end ? MONTHS[r.start - 1] : `${MONTHS[r.start - 1]}–${MONTHS[r.end - 1]}`;
}

export function YearTabs({
  value,
  monthRange,
  onChange,
  onMonthRangeChange,
}: {
  value: string;
  monthRange: MonthRange | null;
  onChange: (year: string) => void;
  onMonthRangeChange: (r: MonthRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Draft state inside the popover so the user can pick start+end before applying.
  const [start, setStart] = useState<number>(monthRange?.start ?? 1);
  const [end, setEnd] = useState<number>(monthRange?.end ?? 12);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset draft to current applied range whenever the popover opens.
  useEffect(() => {
    if (open) {
      setStart(monthRange?.start ?? 1);
      setEnd(monthRange?.end ?? 12);
    }
  }, [open, monthRange]);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const monthsActive = monthRange !== null;

  return (
    <div className="flex items-end gap-1 border-b border-border">
      {YEARS.map((y) => {
        const active = !monthsActive && value === y;
        return (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={[
              "px-4 py-2 text-sm transition-colors -mb-px border-b-2",
              active
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground",
            ].join(" ")}
          >
            {labelFor(y)}
          </button>
        );
      })}

      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={[
            "px-4 py-2 text-sm transition-colors -mb-px border-b-2 flex items-center gap-1",
            monthsActive
              ? "border-foreground text-foreground font-medium"
              : "border-transparent text-muted hover:text-foreground",
          ].join(" ")}
        >
          {monthsActive ? rangeLabel(monthRange!) : "Months"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-md p-3 w-72">
            <div className="text-xs uppercase tracking-wide text-muted mb-2">
              Sales between months (any year)
            </div>
            <div className="flex items-center gap-2">
              <select
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="flex-1 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <span className="text-muted text-sm">to</span>
              <select
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="flex-1 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-2 mt-2">
              Wraps around the year-end (e.g. Nov–Feb is allowed).
            </p>
            <div className="flex items-center justify-between gap-2 mt-3">
              <button
                onClick={() => {
                  onMonthRangeChange(null);
                  setOpen(false);
                }}
                className="text-xs text-muted hover:text-foreground disabled:opacity-40"
                disabled={!monthsActive}
              >
                Clear
              </button>
              <button
                onClick={() => {
                  onMonthRangeChange({ start, end });
                  setOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
