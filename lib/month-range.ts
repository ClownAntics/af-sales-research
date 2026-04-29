import type { Design, MonthRange } from "./types";

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** True if month-of-year `m` (1–12) falls inside [start,end], wrapping at year-end. */
export function monthInRange(m: number, r: MonthRange): boolean {
  return r.start <= r.end
    ? m >= r.start && m <= r.end
    : m >= r.start || m <= r.end;
}

/** Sum of monthly_sales units for any month-of-year in the range, across all years. */
export function unitsInMonthRange(d: Design, r: MonthRange): number {
  if (!d.monthly_sales || d.monthly_sales.length === 0) return 0;
  let total = 0;
  for (const point of d.monthly_sales) {
    if (point.u <= 0) continue;
    const m = parseInt(point.m.slice(5, 7), 10);
    if (!Number.isFinite(m)) continue;
    if (monthInRange(m, r)) total += point.u;
  }
  return total;
}

export function hasSalesInMonthRange(d: Design, r: MonthRange): boolean {
  return unitsInMonthRange(d, r) > 0;
}

export function rangeLabel(r: MonthRange): string {
  return r.start === r.end
    ? MONTH_NAMES[r.start - 1]
    : `${MONTH_NAMES[r.start - 1]}–${MONTH_NAMES[r.end - 1]}`;
}
