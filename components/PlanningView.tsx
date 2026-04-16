"use client";

import { useMemo } from "react";
import type { Design, DesignFilters } from "@/lib/types";
import {
  upcomingEvents,
  matcherToFilter,
  type SeasonalEvent,
} from "@/lib/calendar";

const HORIZON_DAYS = 180;
const RECENT_DAYS = 365;
const UNDERSERVED_MIN_DESIGNS = 5;
const UNDERSERVED_MIN_WIN_PCT = 25;

const SLICE_MIN_DESIGNS = 3; // hide micro-slices with too few designs to read into
const SLICE_TOP_N = 5;

interface SliceRow {
  label: string;
  designs: number;
  winPct: number;
}

interface EventStat {
  event: SeasonalEvent;
  date: Date;
  daysAway: number;
  total: number;
  hit: number;
  solid: number;
  freshDesigns: number;
  winPct: number;
  units: number;
  topSubThemes: SliceRow[];
  topSubSubThemes: SliceRow[];
}

export function PlanningView({
  designs,
  onApplyFilter,
}: {
  designs: Design[];
  onApplyFilter: (next: Partial<DesignFilters>) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const recentCutoff = useMemo(
    () => new Date(now.getTime() - RECENT_DAYS * 86400000),
    [now],
  );

  const events = useMemo<EventStat[]>(() => {
    const upcoming = upcomingEvents(now, HORIZON_DAYS);
    return upcoming.map(({ event, date, daysAway }) => {
      const matching = designs.filter((d) => matchesEvent(d, event));
      const hit = matching.filter((d) => d.classification === "hit").length;
      const solid = matching.filter((d) => d.classification === "solid").length;
      const freshDesigns = matching.filter((d) => {
        const created = d.catalog_created_date || d.first_sale_date;
        return created && new Date(created) >= recentCutoff;
      }).length;
      const total = matching.length;
      const units = matching.reduce((s, d) => s + d.units_total, 0);
      const winPct = total > 0 ? ((hit + solid) / total) * 100 : 0;
      const topSubThemes = topSlices(matching, "sub_themes");
      const topSubSubThemes = topSlices(matching, "sub_sub_themes");
      return {
        event,
        date,
        daysAway,
        total,
        hit,
        solid,
        freshDesigns,
        winPct,
        units,
        topSubThemes,
        topSubSubThemes,
      };
    });
  }, [designs, now, recentCutoff]);

  const underserved = useMemo(
    () => findUnderserved(designs, recentCutoff),
    [designs, recentCutoff],
  );

  const handleViewDesigns = (event: SeasonalEvent) => {
    // Use the first matcher as the primary. Reset other filters that don't
    // apply, switch back to the grid view.
    const f = matcherToFilter(event.matchers[0]);
    onApplyFilter({
      themeName: f.themeName ?? "all",
      subTheme: f.subTheme ?? "all",
      subSubTheme: f.subSubTheme ?? "all",
      tag: f.tag ?? "all",
      view: "all",
    });
  };

  return (
    <div className="space-y-8">
      <div className="text-sm text-muted">
        Planning view for the next <span className="text-foreground font-medium">{HORIZON_DAYS} days</span>.
        Use this to decide what to design before each upcoming season.
      </div>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">Upcoming events</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {events.map((s) => (
            <EventCard
              key={s.event.id}
              stat={s}
              onView={() => handleViewDesigns(s.event)}
            />
          ))}
          {events.length === 0 && (
            <div className="text-sm text-muted">No events in the next {HORIZON_DAYS} days.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">
          Underserved opportunities
        </h2>
        <div className="text-xs text-muted">
          Sub-themes with ≥{UNDERSERVED_MIN_WIN_PCT}% Win that you&apos;ve added few new designs to in the last 12 months.
          Sorted by opportunity = (Win %) ÷ (1 + fresh designs).
        </div>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-border">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 text-left">Sub-theme</th>
                <th className="px-3 py-2 text-right">Designs</th>
                <th className="px-3 py-2 text-right">Win %</th>
                <th className="px-3 py-2 text-right">Avg units</th>
                <th className="px-3 py-2 text-right">New in last 12mo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {underserved.map((u) => (
                <tr key={u.label} className="border-b border-border last:border-0 hover:bg-zinc-50/50">
                  <td className="px-3 py-2 font-medium">{u.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.designs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.winPct.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.avgUnits.toFixed(0)}</td>
                  <td
                    className={[
                      "px-3 py-2 text-right tabular-nums",
                      u.fresh === 0 ? "text-loser" : u.fresh < 3 ? "text-amber-600" : "",
                    ].join(" ")}
                  >
                    {u.fresh}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() =>
                        onApplyFilter({
                          themeName: u.label.split(":")[0].trim(),
                          subTheme: u.label,
                          subSubTheme: "all",
                          tag: "all",
                          view: "all",
                        })
                      }
                      className="text-xs text-muted hover:text-foreground hover:underline"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
              {underserved.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted text-xs">
                    No underserved themes match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EventCard({ stat, onView }: { stat: EventStat; onView: () => void }) {
  const dateStr = stat.date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const isClose = stat.daysAway <= 60;
  const tooFew = stat.freshDesigns < 3;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-base font-medium">
            <span className="mr-1.5">{stat.event.emoji}</span>
            {stat.event.name}
          </div>
          <div className="text-xs text-muted">{dateStr}</div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={[
              "text-xs px-2 py-0.5 rounded",
              isClose ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-muted",
            ].join(" ")}
          >
            {stat.daysAway}d
          </div>
          <button
            onClick={onView}
            className="text-xs px-2 py-0.5 rounded bg-foreground text-background hover:opacity-80"
          >
            View designs →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-2 uppercase tracking-wide">Designs</div>
          <div className="text-base tabular-nums">{stat.total}</div>
        </div>
        <div>
          <div className="text-muted-2 uppercase tracking-wide">Win %</div>
          <div className="text-base tabular-nums">{stat.winPct.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-muted-2 uppercase tracking-wide">Fresh / 12mo</div>
          <div
            className={[
              "text-base tabular-nums",
              tooFew ? "text-loser font-medium" : "",
            ].join(" ")}
          >
            {stat.freshDesigns}
          </div>
        </div>
      </div>

      <SliceList title="Top sub-themes" rows={stat.topSubThemes} />
      <SliceList title="Top sub-sub-themes" rows={stat.topSubSubThemes} />

      {tooFew && (
        <div className="text-xs text-loser bg-loser/5 rounded p-2">
          ⚡ Only {stat.freshDesigns} new design{stat.freshDesigns === 1 ? "" : "s"} in the last year — consider refreshing.
        </div>
      )}
    </div>
  );
}

function SliceList({ title, rows }: { title: string; rows: SliceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="text-xs border-t border-border pt-2">
      <div className="text-muted-2 uppercase tracking-wide mb-1">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-2">
            <span className="truncate text-muted">{shortLabel(r.label)}</span>
            <span className="tabular-nums shrink-0 text-foreground">
              {r.winPct.toFixed(0)}% · {r.designs}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface UnderservedRow {
  label: string;
  designs: number;
  hit: number;
  solid: number;
  winPct: number;
  avgUnits: number;
  fresh: number;
  opportunity: number;
}

function findUnderserved(designs: Design[], recentCutoff: Date): UnderservedRow[] {
  const map = new Map<string, UnderservedRow>();
  for (const d of designs) {
    for (const label of d.sub_themes || []) {
      let r = map.get(label);
      if (!r) {
        r = {
          label,
          designs: 0,
          hit: 0,
          solid: 0,
          winPct: 0,
          avgUnits: 0,
          fresh: 0,
          opportunity: 0,
        };
        map.set(label, r);
      }
      r.designs++;
      r.avgUnits += d.units_total;
      if (d.classification === "hit") r.hit++;
      if (d.classification === "solid") r.solid++;
      const created = d.catalog_created_date || d.first_sale_date;
      if (created && new Date(created) >= recentCutoff) r.fresh++;
    }
  }
  const rows: UnderservedRow[] = [];
  for (const r of map.values()) {
    if (r.designs < UNDERSERVED_MIN_DESIGNS) continue;
    r.winPct = ((r.hit + r.solid) / r.designs) * 100;
    if (r.winPct < UNDERSERVED_MIN_WIN_PCT) continue;
    r.avgUnits = r.avgUnits / r.designs;
    r.opportunity = r.winPct / (1 + r.fresh);
    rows.push(r);
  }
  rows.sort((a, b) => b.opportunity - a.opportunity);
  return rows.slice(0, 20);
}

/**
 * For a set of designs, group them by the values in `field` (sub_themes or
 * sub_sub_themes), compute Win % per slice, and return the top N by Win %.
 * Filters out slices with < SLICE_MIN_DESIGNS to avoid noisy 100% bands.
 */
function topSlices(
  designs: Design[],
  field: "sub_themes" | "sub_sub_themes",
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
    if (r.designs < SLICE_MIN_DESIGNS) continue;
    rows.push({
      label,
      designs: r.designs,
      winPct: ((r.hit + r.solid) / r.designs) * 100,
    });
  }
  // Sort by Win % desc, tiebreak on designs desc.
  rows.sort((a, b) => b.winPct - a.winPct || b.designs - a.designs);
  return rows.slice(0, SLICE_TOP_N);
}

function matchesEvent(d: Design, event: SeasonalEvent): boolean {
  for (const m of event.matchers) {
    const arr = (d[m.field] || []) as string[];
    if (arr.includes(m.value)) return true;
  }
  return false;
}

// Drop the parent name(s) so labels in the slice list are short.
function shortLabel(label: string): string {
  const parts = label.split(":").map((s) => s.trim());
  return parts.length > 1 ? parts.slice(1).join(": ") : label;
}
