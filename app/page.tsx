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
  SummaryCounts,
  ViewFilter,
} from "@/lib/types";
import { hasSalesInMonthRange, unitsInMonthRange } from "@/lib/month-range";

const CLASSIFICATION_VIEWS = ["hit", "solid", "ok", "weak", "dead"] as const;

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
  // Classification view is also kept off the API when monthRange is active so
  // that summary tiles can show counts across all classifications.
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.year !== "all") p.set("year", filters.year);
    if (filters.tag !== "all") p.set("tag", filters.tag);
    if (filters.productType !== "all") p.set("productType", filters.productType);
    if (filters.themeName !== "all") p.set("themeName", filters.themeName);
    if (filters.subTheme !== "all") p.set("subTheme", filters.subTheme);
    if (filters.subSubTheme !== "all") p.set("subSubTheme", filters.subSubTheme);
    // 'patterns' is a UI-only view; the API still returns the same designs.
    if (
      filters.view !== "all" &&
      filters.view !== "patterns" &&
      !filters.monthRange
    ) {
      p.set("view", filters.view);
    }
    return p.toString();
  }, [filters]);

  // Designs that pass search + monthRange (but NOT view). Used for summary
  // recompute so all classification tiles stay populated when a range is
  // active and the user has clicked a single-classification view tile.
  const monthRangeFiltered = useMemo(() => {
    if (!data) return [];
    let rows = data.designs.filter((d) => matchesSearch(d, filters.search));
    if (filters.monthRange) {
      rows = rows.filter((d) =>
        hasSalesInMonthRange(d, filters.monthRange!, filters.productType),
      );
    }
    return rows;
  }, [data, filters.search, filters.monthRange, filters.productType]);

  // Designs the grid actually shows: monthRangeFiltered, then client-side view
  // filter (only when monthRange is active — otherwise the API already applied
  // it server-side). When a range is active, re-sort by in-range units so the
  // top tiles are the strongest sellers in the selected window, not lifetime.
  const filteredDesigns = useMemo(() => {
    let rows = monthRangeFiltered;
    if (
      filters.monthRange &&
      (CLASSIFICATION_VIEWS as readonly string[]).includes(filters.view)
    ) {
      rows = rows.filter((d) => d.classification === filters.view);
    }
    if (filters.monthRange) {
      const r = filters.monthRange;
      const pt = filters.productType;
      // Cache per-design in-range totals so the comparator stays O(1).
      const cache = new Map<string, number>();
      const score = (d: Design): number => {
        let v = cache.get(d.design_family);
        if (v === undefined) {
          v = unitsInMonthRange(d, r, pt);
          cache.set(d.design_family, v);
        }
        return v;
      };
      rows = [...rows].sort((a, b) => {
        const diff = score(b) - score(a);
        return diff !== 0 ? diff : a.design_family.localeCompare(b.design_family);
      });
    }
    return rows;
  }, [monthRangeFiltered, filters.view, filters.monthRange, filters.productType]);

  // When a month range is active, the API summary (year-based) no longer
  // matches what's on screen. Recompute counts from the month-range set
  // (ignoring view), bucketing by each design's lifetime classification.
  const displaySummary: SummaryCounts = useMemo(() => {
    if (!filters.monthRange) {
      return data?.summary || { total: 0, hit: 0, solid: 0, ok: 0, weak: 0, dead: 0 };
    }
    const s: SummaryCounts = { total: 0, hit: 0, solid: 0, ok: 0, weak: 0, dead: 0 };
    for (const d of monthRangeFiltered) {
      s.total++;
      if (d.classification && d.classification in s) {
        (s as unknown as Record<string, number>)[d.classification]++;
      }
    }
    return s;
  }, [data?.summary, filters.monthRange, monthRangeFiltered]);

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
        <DesignGrid
          designs={filteredDesigns}
          monthRange={filters.monthRange}
          productType={filters.productType}
          onOpenDetail={setDetail}
        />
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
