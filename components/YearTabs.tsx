"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MonthRange } from "@/lib/types";
import {
  AVAILABLE_YEARS,
  MONTH_NAMES,
  futureMonthsInRange,
  rangeLabel,
} from "@/lib/month-range";

const YEARS = ["all", "pre-2023", "2023", "2024", "2025", "2026"] as const;

function labelFor(y: string): string {
  if (y === "all") return "All";
  if (y === "pre-2023") return "Pre-2023";
  return y;
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
  // Draft state inside the popover so the user can pick start+end+years before applying.
  const [start, setStart] = useState<number>(monthRange?.start ?? 1);
  const [end, setEnd] = useState<number>(monthRange?.end ?? 12);
  const [years, setYears] = useState<number[]>(monthRange?.years ?? [...AVAILABLE_YEARS]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset draft to current applied range whenever the popover opens.
  useEffect(() => {
    if (open) {
      setStart(monthRange?.start ?? 1);
      setEnd(monthRange?.end ?? 12);
      setYears(monthRange?.years ?? [...AVAILABLE_YEARS]);
    }
  }, [open, monthRange]);

  // No wrap-around: end must be >= start. If user moves start past end, bump end.
  useEffect(() => {
    if (end < start) setEnd(start);
  }, [start, end]);

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
  const sortedYears = useMemo(() => [...years].sort((a, b) => a - b), [years]);

  // Inline future-month warning.
  const future = useMemo(
    () => futureMonthsInRange({ start, end, years: sortedYears }),
    [start, end, sortedYears],
  );
  const futureMsg = future.length === 0
    ? null
    : (() => {
        const first = future[0];
        const more = future.length > 1 ? ` (+${future.length - 1} more)` : "";
        return `${MONTH_NAMES[first.month - 1]} ${first.year} hasn't happened yet${more}.`;
      })();

  const toggleYear = (y: number) => {
    setYears((prev) => (prev.includes(y) ? prev.filter((p) => p !== y) : [...prev, y]));
  };

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
          <div className="absolute left-0 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-md p-3 w-80">
            <div className="text-xs uppercase tracking-wide text-muted mb-2">
              Months
            </div>
            <div className="flex items-center gap-2">
              <select
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="flex-1 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <span className="text-muted text-sm">to</span>
              <select
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="flex-1 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground"
              >
                {MONTH_NAMES.map((m, i) => {
                  const monthNum = i + 1;
                  if (monthNum < start) return null;
                  return (
                    <option key={m} value={monthNum}>{m}</option>
                  );
                })}
              </select>
            </div>

            <div className="text-xs uppercase tracking-wide text-muted mt-3 mb-2 flex items-center justify-between">
              <span>Years</span>
              <button
                type="button"
                onClick={() =>
                  setYears(
                    years.length === AVAILABLE_YEARS.length ? [] : [...AVAILABLE_YEARS],
                  )
                }
                className="text-[10px] normal-case tracking-normal text-muted-2 hover:text-foreground"
              >
                {years.length === AVAILABLE_YEARS.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_YEARS.map((y) => {
                const checked = years.includes(y);
                return (
                  <label
                    key={y}
                    className={[
                      "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-sm select-none",
                      checked
                        ? "border-foreground bg-foreground/5"
                        : "border-border text-muted hover:border-muted-2",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleYear(y)}
                      className="accent-foreground"
                    />
                    {y}
                  </label>
                );
              })}
            </div>

            {futureMsg && (
              <p className="text-xs text-amber-600 mt-3">{futureMsg}</p>
            )}

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
                  onMonthRangeChange({ start, end, years: sortedYears });
                  setOpen(false);
                }}
                disabled={years.length === 0}
                className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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
