"use client";

import { useMemo, useState } from "react";
import type { Design, DesignFilters } from "@/lib/types";

type GroupBy = "theme_names" | "sub_themes" | "sub_sub_themes";
type SortKey = "label" | "designs" | "hit_pct" | "units_total" | "units_avg";

interface Row {
  label: string;
  designs: number;
  hit: number;
  solid: number;
  ok: number;
  weak: number;
  dead: number;
  units_total: number;
  units_avg: number;
  hit_pct: number;
}

/**
 * Auto-drill-down logic based on what's selected in the filter bar:
 *   nothing selected       → group by top-level themes (Beaches & Nautical, Birds, …)
 *   Theme picked           → group by sub-themes of that theme
 *   Sub-theme picked       → group by sub-sub-themes of that sub-theme
 *   Sub-sub-theme picked   → just that one row
 */
function deriveGrouping(filters: DesignFilters): {
  groupBy: GroupBy;
  prefix: string | null; // when set, only include labels starting with `${prefix}: `
  exact: string | null;  // when set, only include the row whose label === exact
} {
  if (filters.subSubTheme !== "all") {
    return { groupBy: "sub_sub_themes", prefix: null, exact: filters.subSubTheme };
  }
  if (filters.subTheme !== "all") {
    return { groupBy: "sub_sub_themes", prefix: filters.subTheme, exact: null };
  }
  if (filters.themeName !== "all") {
    return { groupBy: "sub_themes", prefix: filters.themeName, exact: null };
  }
  return { groupBy: "theme_names", prefix: null, exact: null };
}

export function ThemeSummary({
  designs,
  filters,
}: {
  designs: Design[];
  filters: DesignFilters;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("designs");
  const [sortDesc, setSortDesc] = useState(true);

  const { groupBy, prefix, exact } = useMemo(
    () => deriveGrouping(filters),
    [filters],
  );

  const rows = useMemo(
    () => buildRows(designs, groupBy, prefix, exact),
    [designs, groupBy, prefix, exact],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(key !== "label");
    }
  };

  const levelLabel =
    groupBy === "theme_names"
      ? "Theme"
      : groupBy === "sub_themes"
        ? "Sub-theme"
        : "Sub-sub-theme";

  const breadcrumb = buildBreadcrumb(filters);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <div className="text-muted">
          {breadcrumb ? (
            <>
              Showing <span className="font-medium text-foreground">{levelLabel.toLowerCase()}s</span>{" "}
              within <span className="text-foreground">{breadcrumb}</span>
            </>
          ) : (
            <>Showing all <span className="font-medium text-foreground">{levelLabel.toLowerCase()}s</span></>
          )}
        </div>
        <span className="text-xs text-muted">
          {sorted.length} groups · {designs.length.toLocaleString()} designs
        </span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-border">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <Th onClick={() => onSort("label")} active={sortKey === "label"} desc={sortDesc} align="left">
                  {levelLabel}
                </Th>
                <Th onClick={() => onSort("designs")} active={sortKey === "designs"} desc={sortDesc}>
                  Designs
                </Th>
                <th className="px-3 py-2 text-right">Hit</th>
                <th className="px-3 py-2 text-right">Solid</th>
                <th className="px-3 py-2 text-right">OK</th>
                <th className="px-3 py-2 text-right">Weak</th>
                <th className="px-3 py-2 text-right">Dead</th>
                <Th onClick={() => onSort("hit_pct")} active={sortKey === "hit_pct"} desc={sortDesc}>
                  Hit %
                </Th>
                <Th onClick={() => onSort("units_total")} active={sortKey === "units_total"} desc={sortDesc}>
                  Units
                </Th>
                <Th onClick={() => onSort("units_avg")} active={sortKey === "units_avg"} desc={sortDesc}>
                  Avg/design
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0 hover:bg-zinc-50/50">
                  <td className="px-3 py-2 font-medium">{shortLabel(r.label, prefix)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.designs.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.hit || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{r.solid || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-600">{r.ok || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-orange-600">{r.weak || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.dead || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.hit_pct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.units_total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.units_avg.toFixed(0)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted text-xs">
                    No designs match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  desc,
  align = "right",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 cursor-pointer select-none ${align === "left" ? "text-left" : "text-right"} ${
        active ? "text-foreground" : ""
      } hover:text-foreground`}
    >
      {children}
      {active ? <span className="ml-1">{desc ? "↓" : "↑"}</span> : null}
    </th>
  );
}

function buildRows(
  designs: Design[],
  groupBy: GroupBy,
  prefix: string | null,
  exact: string | null,
): Row[] {
  const byLabel = new Map<string, Row>();

  for (const d of designs) {
    const labels = (d[groupBy] || []) as string[];
    // Designs with no themes at this level are simply skipped — no "(none)"
    // bucket. They still contribute to the overall design count.
    if (labels.length === 0) continue;
    for (const label of labels) {
      // Apply parent-filter constraint.
      if (exact && label !== exact) continue;
      if (prefix && !label.startsWith(`${prefix}: `)) continue;

      let r = byLabel.get(label);
      if (!r) {
        r = {
          label,
          designs: 0,
          hit: 0,
          solid: 0,
          ok: 0,
          weak: 0,
          dead: 0,
          units_total: 0,
          units_avg: 0,
          hit_pct: 0,
        };
        byLabel.set(label, r);
      }
      r.designs++;
      r.units_total += d.units_total;
      switch (d.classification) {
        case "hit":
          r.hit++;
          break;
        case "solid":
          r.solid++;
          break;
        case "ok":
          r.ok++;
          break;
        case "weak":
          r.weak++;
          break;
        case "dead":
          r.dead++;
          break;
      }
    }
  }

  for (const r of byLabel.values()) {
    r.units_avg = r.designs > 0 ? r.units_total / r.designs : 0;
    r.hit_pct = r.designs > 0 ? (r.hit / r.designs) * 100 : 0;
  }
  return Array.from(byLabel.values());
}

// Drop the parent prefix so "Beaches & Nautical: Beach" → "Beach" once we've
// already filtered to that theme.
function shortLabel(label: string, prefix: string | null): string {
  if (!prefix) return label;
  return label.startsWith(`${prefix}: `) ? label.slice(prefix.length + 2) : label;
}

function buildBreadcrumb(filters: DesignFilters): string | null {
  const parts: string[] = [];
  if (filters.themeName !== "all") parts.push(filters.themeName);
  if (filters.subTheme !== "all") {
    parts.push(filters.subTheme.replace(/^[^:]+:\s*/, ""));
  }
  if (filters.subSubTheme !== "all") {
    parts.push(filters.subSubTheme.split(": ").slice(-1)[0]);
  }
  return parts.length > 0 ? parts.join(" › ") : null;
}
