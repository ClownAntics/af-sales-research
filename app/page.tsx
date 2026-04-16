"use client";

import { useEffect, useMemo, useState } from "react";
import { YearTabs } from "@/components/YearTabs";
import { SummaryCards } from "@/components/SummaryCards";
import { FilterBar } from "@/components/FilterBar";
import { DesignGrid } from "@/components/DesignGrid";
import { PatternCharts } from "@/components/PatternCharts";
import { ThemeSummary } from "@/components/ThemeSummary";
import { PlanningView } from "@/components/PlanningView";
import type {
  DesignFilters,
  DesignsResponse,
  ViewFilter,
} from "@/lib/types";

const DEFAULT_FILTERS: DesignFilters = {
  year: "all",
  tag: "all",
  productType: "all",
  themeName: "all",
  subTheme: "all",
  subSubTheme: "all",
  view: "all",
};

export default function Home() {
  const [filters, setFilters] = useState<DesignFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<DesignsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <header>
        <h1 className="text-2xl font-medium tracking-tight">AF sales research</h1>
        <p className="text-sm text-muted">
          Which AF designs succeeded since 2023, and what patterns explain why?
        </p>
      </header>

      <YearTabs value={filters.year} onChange={(year) => update({ year })} />

      <SummaryCards
        summary={
          data?.summary || { total: 0, hit: 0, solid: 0, ok: 0, weak: 0, dead: 0 }
        }
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
        <PatternCharts designs={data.designs} />
      ) : data && filters.view === "theme-summary" ? (
        <ThemeSummary designs={data.designs} filters={filters} />
      ) : data && filters.view === "planning" ? (
        <PlanningView designs={data.designs} />
      ) : data ? (
        <DesignGrid designs={data.designs} />
      ) : null}
    </main>
  );
}
