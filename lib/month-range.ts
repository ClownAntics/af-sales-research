import type { Design, MonthlyPoint, MonthRange } from "./types";

/** Pick the right monthly_sales source for a design based on the active Type
 *  filter. Falls back to the family aggregate when no specific variant is
 *  requested or when the variant column is missing/empty. */
export function pickMonthlySource(
  d: Design,
  productType?: string,
): MonthlyPoint[] {
  if (productType === "garden" && d.monthly_sales_garden)
    return d.monthly_sales_garden;
  if (productType === "house" && d.monthly_sales_house)
    return d.monthly_sales_house;
  if (productType === "garden-banner" && d.monthly_sales_garden_banner)
    return d.monthly_sales_garden_banner;
  return d.monthly_sales || [];
}

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Years selectable in the month-range popover. Invoice data starts Jan 2023.
 *  Bump this list each January when a new year of data starts coming in. */
export const AVAILABLE_YEARS = [2023, 2024, 2025, 2026] as const;

/** True if month-of-year `m` (1–12) falls inside [start,end]. End must be >= start
 *  (wrap-around is intentionally not supported — see UI constraint in YearTabs). */
export function monthInRange(m: number, r: MonthRange): boolean {
  return m >= r.start && m <= r.end;
}

/** Sum of monthly_sales units for any month in the range, restricted to the
 *  selected calendar years. When `productType` is a specific variant the
 *  variant-specific monthly_sales column is used instead of the family
 *  aggregate. */
export function unitsInMonthRange(
  d: Design,
  r: MonthRange,
  productType?: string,
): number {
  const source = pickMonthlySource(d, productType);
  if (source.length === 0) return 0;
  if (r.years.length === 0) return 0;
  const yearSet = new Set(r.years);
  let total = 0;
  for (const point of source) {
    if (point.u <= 0) continue;
    const year = parseInt(point.m.slice(0, 4), 10);
    const month = parseInt(point.m.slice(5, 7), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    if (!yearSet.has(year)) continue;
    if (monthInRange(month, r)) total += point.u;
  }
  return total;
}

export function hasSalesInMonthRange(
  d: Design,
  r: MonthRange,
  productType?: string,
): boolean {
  return unitsInMonthRange(d, r, productType) > 0;
}

/** Short label for the popover button + tile copy.
 *  - All AVAILABLE_YEARS selected → "May–Jun"
 *  - One year                    → "May–Jun 2024"
 *  - Subset                      → "May–Jun 2024,2025" */
export function rangeLabel(r: MonthRange): string {
  const monthPart = r.start === r.end
    ? MONTH_NAMES[r.start - 1]
    : `${MONTH_NAMES[r.start - 1]}–${MONTH_NAMES[r.end - 1]}`;
  const allSelected =
    r.years.length === AVAILABLE_YEARS.length &&
    AVAILABLE_YEARS.every((y) => r.years.includes(y));
  if (allSelected) return monthPart;
  if (r.years.length === 0) return `${monthPart} (no years)`;
  const sorted = [...r.years].sort((a, b) => a - b);
  return r.years.length === 1
    ? `${monthPart} ${sorted[0]}`
    : `${monthPart} ${sorted.join(",")}`;
}

/** Returns the `(year, month)` pairs in the range that haven't happened yet,
 *  relative to `now`. Used for the popover's future-month warning. */
export function futureMonthsInRange(
  r: MonthRange,
  now: Date = new Date(),
): { year: number; month: number }[] {
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1; // 1–12
  const out: { year: number; month: number }[] = [];
  for (const year of r.years) {
    for (let month = r.start; month <= r.end; month++) {
      if (year > todayYear || (year === todayYear && month > todayMonth)) {
        out.push({ year, month });
      }
    }
  }
  return out;
}
