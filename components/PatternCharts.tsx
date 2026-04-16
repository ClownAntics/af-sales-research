"use client";

import type { Design } from "@/lib/types";

const TOP_N = 12;

function sliceCounts(
  designs: Design[],
  field: "theme_names" | "sub_themes",
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of designs) {
    for (const t of (d[field] || []) as string[]) {
      map.set(t, (map.get(t) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

export function PatternCharts({ designs }: { designs: Design[] }) {
  // Compare what works (Hits) vs what flops (Weak + Dead). Use the cleaned
  // FL Themes taxonomy (theme_names / sub_themes), NOT raw shopify_tags —
  // raw tags include admin junk like "in-stock", "Decorative", "Printed".
  const hits = designs.filter((d) => d.classification === "hit");
  const flops = designs.filter(
    (d) => d.classification === "weak" || d.classification === "dead",
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Chart
        title="Top sub-themes in HITS (100+ units)"
        data={sliceCounts(hits, "sub_themes")}
        color="bg-emerald-600"
      />
      <Chart
        title="Top themes in HITS"
        data={sliceCounts(hits, "theme_names")}
        color="bg-emerald-600"
      />
      <Chart
        title="Top sub-themes in WEAK + DEAD"
        data={sliceCounts(flops, "sub_themes")}
        color="bg-red-600"
      />
      <Chart
        title="Top themes in WEAK + DEAD"
        data={sliceCounts(flops, "theme_names")}
        color="bg-red-600"
      />
    </div>
  );
}

function Chart({
  title,
  data,
  color,
}: {
  title: string;
  data: { label: string; count: number }[];
  color: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {data.length === 0 ? (
        <div className="text-xs text-muted py-6 text-center">no data</div>
      ) : (
        <div className="space-y-1.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-xs">
              <div className="w-32 truncate text-muted shrink-0" title={d.label}>
                {d.label}
              </div>
              <div className="flex-1 bg-zinc-100 rounded-sm h-4 relative overflow-hidden">
                <div
                  className={`h-full ${color}`}
                  style={{ width: `${(d.count / max) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right tabular-nums">{d.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
