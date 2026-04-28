"use client";

import { useEffect, useMemo, useState } from "react";
import { YearTabs } from "@/components/YearTabs";
import { SummaryCards } from "@/components/SummaryCards";
import { FilterBar } from "@/components/FilterBar";
import { DesignGrid } from "@/components/DesignGrid";
import { PatternCharts } from "@/components/PatternCharts";
import { ThemeSummary } from "@/components/ThemeSummary";
import { PlanningView } from "@/components/PlanningView";
import { DetailModal } from "@/components/DetailModal";
import type {
  Design,
  DesignFilters,
  DesignsResponse,
  MonthRange,
  SummaryCounts,
  ViewFilter,
} from "@/lib/types";

const DEFAULT_FILTERS: DesignFilters = {
  year: "all",
  tag: "all",
  productType: "all",
  themeName: "all",
  subTheme: "all",
  subSubTheme: "all",
  search: "",
  view: "all",
  monthRange: null,
};

/** True if month-of-year `m` (1–12) falls inside [start,end], wrapping at year-end. */
function monthInRange(m: number, r: MonthRange): boolean {
  return r.start <= r.end
    ? m >= r.start && m <= r.end
    : m >= r.start || m <= r.end;
}

function hasSalesInMonthRange(d: Design, r: MonthRange): boolean {
  if (!d.monthly_sales || d.monthly_sales.length === 0) return false;
  for (const point of d.monthly_sales) {
    if (point.u <= 0) continue;
    const m = parseInt(point.m.slice(5, 7), 10);
    if (!Number.isFinite(m)) continue;
    if (monthInRange(m, r)) return true;
  }
  return false;
}

function SearchBox({
  value,
  onChange,
  matchCount,
}: {
  value: string;
  onChange: (v: string) => void;
  matchCount: number | null;
}) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-muted-2 pointer-events-none" aria-hidden>
        {/* search icon (inline SVG, no icon library) */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search SKU or name"
        className="bg-card border border-border rounded-full pl-9 pr-9 py-2 text-sm w-64 focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10 transition-all placeholder:text-muted-2"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 text-muted-2 hover:text-foreground"
          aria-label="Clear search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      {matchCount !== null && (
        <span className="ml-2 text-xs text-muted tabular-nums">
          {matchCount} {matchCount === 1 ? "match" : "matches"}
        </span>
      )}
    </div>
  );
}

function matchesSearch(
  d: { design_family: string; design_name: string | null },
  query: string,
): boolean {
  if (!query) return true;
  // Normalize both sides: lowercase, strip non-alphanumeric so "AFGF MS 0278"
  // matches "AFGFMS0278" and users can be sloppy with spaces/dashes.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = norm(query);
  if (!q) return true;
  const body = d.design_family.replace(/^AF/, "");
  // Check: exact family, each constructed SKU, and the design name.
  const haystack = [
    d.design_family,
    `AFGF${body}`,
    `AFHF${body}`,
    `AFGB${body}`,
    d.design_name || "",
  ]
    .map(norm)
    .join(" ");
  return haystack.includes(q);
}

export default function Home() {
  const [filters, setFilters] = useState<DesignFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<DesignsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Design | null>(null);

  // Search and monthRange are applied client-side only; don't include them in
  // the API query (search would otherwise re-fetch on every keystroke, and
  // monthRange filters per-design jsonb that's already in the response).
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.year !== "all") p.set("year", filters.year);
    if (filters.tag !== "all") p.set("tag", filters.tag);
    if (filters.productType !== "all") p.set("productType", filters.productType);
    if (filters.themeName !== "all") p.set("themeName", filters.themeName);
    if (filters.subTheme !== "all") p.set("subTheme", filters.subTheme);
    if (filters.subSubTheme !== "all") p.set("subSubTheme", filters.subSubTheme);
    // 'patterns' is a UI-only view; the API still returns the same designs.
    if (filters.view !== "all" && filters.view !== "patterns") {
      p.set("view", filters.view);
    }
    return p.toString();
  }, [filters]);

  // Designs the views actually see: API result, then client-side search +
  // month-range filters.
  const filteredDesigns = useMemo(() => {
    if (!data) return [];
    let rows = data.designs.filter((d) => matchesSearch(d, filters.search));
    if (filters.monthRange) {
      rows = rows.filter((d) => hasSalesInMonthRange(d, filters.monthRange!));
    }
    return rows;
  }, [data, filters.search, filters.monthRange]);

  // When a month range is active, the API summary (which is year-based) no
  // longer matches what's on screen. Recompute counts from the filtered set,
  // bucketing by each design's lifetime classification.
  const displaySummary: SummaryCounts = useMemo(() => {
    if (!filters.monthRange) {
      return data?.summary || { total: 0, hit: 0, solid: 0, ok: 0, weak: 0, dead: 0 };
    }
    const s: SummaryCounts = { total: 0, hit: 0, solid: 0, ok: 0, weak: 0, dead: 0 };
    for (const d of filteredDesigns) {
      s.total++;
      if (d.classification && d.classification in s) {
        (s as unknown as Record<string, number>)[d.classification]++;
      }
    }
    return s;
  }, [data?.summary, filters.monthRange, filteredDesigns]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/designs${qs ? `?${qs}` : ""}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<DesignsResponse>;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [qs]);

  const update = (next: Partial<DesignFilters>) =>
    setFilters((f) => ({ ...f, ...next }));
  const setView = (v: ViewFilter) => update({ view: v });

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 w-full">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">AF sales research</h1>
            <p className="text-sm text-muted">
              Which AF designs succeeded since 2023, and what patterns explain why?
            </p>
          </div>
          <SearchBox
            value={filters.search}
            onChange={(v) => update({ search: v })}
            matchCount={filters.search ? filteredDesigns.length : null}
          />
        </div>
        <nav className="flex gap-3 text-xs text-muted shrink-0 pt-1">
          <a
            href="https://github.com/ClownAntics/af-sales-research/blob/main/docs/USER_GUIDE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            User guide
          </a>
          <span className="text-muted-2">·</span>
          <a
            href="https://github.com/ClownAntics/af-sales-research/blob/main/docs/DATA_UPDATE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            Data updates
          </a>
        </nav>
      </header>

      <YearTabs
        value={filters.year}
        monthRange={filters.monthRange}
        onChange={(year) => update({ year, monthRange: null })}
        onMonthRangeChange={(monthRange) =>
          update({ monthRange, year: monthRange ? "all" : filters.year })
        }
      />

      <SummaryCards
        summary={displaySummary}
        view={filters.view}
        onView={setView}
      />

      <FilterBar
        filters={filters}
        tags={data?.tags || []}
        productTypes={data?.productTypes || []}
        themeNames={data?.themeNames || []}
        subThemes={data?.subThemes || []}
        subSubThemes={data?.subSubThemes || []}
        designs={filteredDesigns}
        onChange={update}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      {error && (
        <div className="text-sm text-loser border border-loser/20 bg-loser/5 rounded p-3">
          {error}
        </div>
      )}

      {!data && !error && <div className="text-sm text-muted">Loading…</div>}

      {data && filters.view === "patterns" ? (
        <PatternCharts designs={filteredDesigns} />
      ) : data && filters.view === "theme-summary" ? (
        <ThemeSummary designs={filteredDesigns} filters={filters} />
      ) : data && filters.view === "planning" ? (
        <PlanningView designs={filteredDesigns} onApplyFilter={update} />
      ) : data ? (
        <DesignGrid designs={filteredDesigns} onOpenDetail={setDetail} />
      ) : null}

      {detail && (
        <DetailModal
          key={detail.design_family}
          design={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  );
}
