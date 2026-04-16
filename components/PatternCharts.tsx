"use client";

import type { Design } from "@/lib/types";

const TOP_N = 12;
const MIN_DESIGNS = 8; // ignore slices too small to read into

interface SliceRow {
  label: string;
  designs: number;
  hit: number;
  solid: number;
  winPct: number;
}

function sliceWinPct(
  designs: Design[],
  field: "theme_names" | "sub_themes",
): SliceRow[] {
  const map = new Map<string, { designs: number; hit: number; solid: number }>();
  for (const d of designs) {
    for (const label of (d[field] || []) as string[]) {
      let r = map.get(label);
      if (!r) {
        r = { designs: 0, hit: 0, solid: 0 };
        map.set(label, r);
      }
      r.designs++;
      if (d.classification === "hit") r.hit++;
      if (d.classification === "solid") r.solid++;
    }
  }
  const rows: SliceRow[] = [];
  for (const [label, r] of map.entries()) {
    if (r.designs < MIN_DESIGNS) continue;
    rows.push({
      label,
      designs: r.designs,
      hit: r.hit,
      solid: r.solid,
      winPct: ((r.hit + r.solid) / r.designs) * 100,
    });
  }
  return rows;
}

export function PatternCharts({ designs }: { designs: Design[] }) {
  // Compute once per slice — then sort high or low for the four panels.
  const subThemes = sliceWinPct(designs, "sub_themes");
  const themes = sliceWinPct(designs, "theme_names");

  const topBy = (rows: SliceRow[]) =>
    [...rows].sort((a, b) => b.winPct - a.winPct).slice(0, TOP_N);
  const bottomBy = (rows: SliceRow[]) =>
    [...rows].sort((a, b) => a.winPct - b.winPct).slice(0, TOP_N);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        Win % = (Hit + Solid) ÷ designs in that slice. Slices with fewer than {MIN_DESIGNS} designs are excluded so percentages aren&apos;t skewed by tiny samples.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Chart
          title="Best sub-themes by Win %"
          rows={topBy(subThemes)}
          color="bg-emerald-600"
        />
        <Chart
          title="Best themes by Win %"
          rows={topBy(themes)}
          color="bg-emerald-600"
        />
        <Chart
          title="Worst sub-themes by Win %"
          rows={bottomBy(subThemes)}
          color="bg-red-600"
        />
        <Chart
          title="Worst themes by Win %"
          rows={bottomBy(themes)}
          color="bg-red-600"
        />
      </div>
    </div>
  );
}

function Chart({
  title,
  rows,
  color,
}: {
  title: string;
  rows: SliceRow[];
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted py-6 text-center">no data</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-xs">
              <div className="w-40 truncate text-muted shrink-0" title={r.label}>
                {r.label}
              </div>
              <div className="flex-1 bg-zinc-100 rounded-sm h-4 relative overflow-hidden">
                <div
                  className={`h-full ${color}`}
                  style={{ width: `${Math.max(2, r.winPct)}%` }}
                />
              </div>
              <div className="w-20 text-right tabular-nums text-muted">
                <span className="text-foreground">{r.winPct.toFixed(0)}%</span>
                <span className="text-muted-2"> · {r.designs}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
