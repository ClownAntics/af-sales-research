"use client";

import type { SummaryCounts, ViewFilter } from "@/lib/types";

interface Card {
  label: string;
  count: number;
  view: ViewFilter;
  accent?: string;
}

export function SummaryCards({
  summary,
  view,
  onView,
}: {
  summary: SummaryCounts;
  view: ViewFilter;
  onView: (v: ViewFilter) => void;
}) {
  const cards: Card[] = [
    { label: "Designs", count: summary.total, view: "all" },
    { label: "Hit (100+)", count: summary.hit, view: "hit", accent: "text-emerald-600" },
    { label: "Solid (26–99)", count: summary.solid, view: "solid", accent: "text-emerald-500" },
    { label: "OK (6–25)", count: summary.ok, view: "ok", accent: "text-amber-600" },
    { label: "Weak (1–5)", count: summary.weak, view: "weak", accent: "text-orange-600" },
    { label: "Dead (0)", count: summary.dead, view: "dead", accent: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => {
        const active = view === c.view;
        return (
          <button
            key={c.label}
            onClick={() => onView(c.view)}
            className={[
              "text-left p-4 rounded-lg bg-card border transition-colors",
              active
                ? "border-foreground"
                : "border-border hover:border-muted-2",
            ].join(" ")}
          >
            <div className="text-xs uppercase tracking-wide text-muted">
              {c.label}
            </div>
            <div className={`mt-1 text-2xl font-medium ${c.accent || ""}`}>
              {(c.count ?? 0).toLocaleString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
