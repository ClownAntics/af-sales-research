"use client";

import { useEffect, useMemo } from "react";
import type { Design, MonthlyPoint } from "@/lib/types";

const MONTHS_WINDOW = 24; // past 2 years

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Return an array of the last N month strings 'YYYY-MM' ending at current month.
function last24Months(now: Date, count: number): string[] {
  const out: string[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-based
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, "0")}`);
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }
  return out;
}

// Canonical-AF families (e.g. `AFSP0419`) expand to a real Shopify garden
// variant (`AFGFSP0419`). For everything else, the design_family IS the
// real Shopify SKU — never fabricate `AFGFCA52602`.
const CANONICAL_AF = /^AF[A-Z]{2}\d{4}$/;
function gardenSku(design: Design): string {
  const family = design.design_family;
  if (!CANONICAL_AF.test(family)) return family;
  const body = family.replace(/^AF/, "");
  const suffix = design.has_monogram
    ? "A"
    : design.has_personalized
      ? "-CF"
      : design.has_preprint
        ? "WH"
        : "";
  return `AFGF${body}${suffix}`;
}

export function DetailModal({
  design,
  onClose,
}: {
  design: Design;
  onClose: () => void;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => last24Months(now, MONTHS_WINDOW), [now]);

  // Map 'YYYY-MM' -> units for the last 24 months (missing months = 0).
  const series = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const p of (design.monthly_sales || []) as MonthlyPoint[]) {
      byMonth.set(p.m, p.u);
    }
    return months.map((m) => ({ m, u: byMonth.get(m) || 0 }));
  }, [design.monthly_sales, months]);

  const maxU = Math.max(1, ...series.map((s) => s.u));
  const totalInWindow = series.reduce((s, p) => s + p.u, 0);

  const sku = gardenSku(design);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={design.design_name || design.design_family}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-2 gap-4 border-b border-border">
          <div>
            <h2 className="text-lg font-medium">
              {design.design_name || design.design_family}
            </h2>
            <div className="text-xs font-mono text-muted-2 mt-0.5">
              {sku}
              <span className="mx-1">·</span>
              {design.units_total.toLocaleString()} units
              {design.classification && (
                <>
                  <span className="mx-1">·</span>
                  <span className="uppercase">{design.classification}</span>
                </>
              )}
              <span className="mx-1">·</span>
              added {formatMonthYear(design.catalog_created_date)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground shrink-0"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {/* Chart */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">Monthly units — last 24 months</h3>
              <span className="text-xs text-muted tabular-nums">
                {totalInWindow.toLocaleString()} in window
              </span>
            </div>

            <MonthlyBars series={series} maxU={maxU} now={now} />

            <div className="text-xs text-muted pt-1">
              {totalInWindow === 0 ? (
                <span>No sales recorded in the last 24 months.</span>
              ) : (
                <span>
                  Peak: {Math.max(...series.map((s) => s.u)).toLocaleString()} in{" "}
                  {labelFor(series.find((s) => s.u === maxU)!.m)} · Avg{" "}
                  {(totalInWindow / MONTHS_WINDOW).toFixed(1)}/mo
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CHART_HEIGHT_PX = 200;

function MonthlyBars({
  series,
  maxU,
  now,
}: {
  series: { m: string; u: number }[];
  maxU: number;
  now: Date;
}) {
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <div>
      <div
        className="flex items-end gap-[3px]"
        style={{ height: `${CHART_HEIGHT_PX}px` }}
      >
        {series.map((p) => {
          // Pixel-based height so bars render regardless of flex parent sizing.
          const h = Math.max(2, Math.round((p.u / maxU) * CHART_HEIGHT_PX));
          const isCurrent = p.m === currentMonth;
          return (
            <div
              key={p.m}
              className={[
                "flex-1 rounded-t-sm transition-colors hover:brightness-110",
                isCurrent ? "bg-emerald-400" : "bg-emerald-600",
              ].join(" ")}
              style={{ height: `${h}px` }}
              title={`${labelFor(p.m)}: ${p.u.toLocaleString()} units${isCurrent ? " (partial)" : ""}`}
            />
          );
        })}
      </div>
      {/* Month ticks — only show Jan + Jul to avoid crowding */}
      <div className="flex gap-[3px] mt-1">
        {series.map((p) => {
          const [, mm] = p.m.split("-");
          const showLabel = mm === "01" || mm === "07";
          return (
            <div key={p.m} className="flex-1 text-[10px] text-muted text-center">
              {showLabel ? labelFor(p.m) : "\u00A0"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(ym: string): string {
  const [y, mm] = ym.split("-");
  const mIdx = Number(mm) - 1;
  return `${MONTHS[mIdx]} ${y.slice(2)}`; // e.g. "Jan 24"
}
