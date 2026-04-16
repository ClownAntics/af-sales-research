"use client";

import { useMemo } from "react";
import type { Design } from "@/lib/types";
import { upcomingEvents, type SeasonalEvent } from "@/lib/calendar";

const HORIZON_DAYS = 180;
const RECENT_DAYS = 365; // designs created within last year count as "fresh"
const UNDERSERVED_MIN_DESIGNS = 5; // ignore tiny themes
const UNDERSERVED_MIN_WIN_PCT = 25; // only flag themes that genuinely sell

interface EventStat {
  event: SeasonalEvent;
  date: Date;
  daysAway: number;
  total: number;
  hit: number;
  solid: number;
  freshDesigns: number; // created in last RECENT_DAYS
  winPct: number;
  units: number;
  topDesigns: Design[]; // top 3 by units_total
}

export function PlanningView({ designs }: { designs: Design[] }) {
  const now = useMemo(() => new Date(), []);
  const recentCutoff = useMemo(
    () => new Date(now.getTime() - RECENT_DAYS * 86400000),
    [now],
  );

  const events = useMemo(() => {
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
      const topDesigns = [...matching]
        .sort((a, b) => b.units_total - a.units_total)
        .slice(0, 3);
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
        topDesigns,
      } as EventStat;
    });
  }, [designs, now, recentCutoff]);

  const underserved = useMemo(
    () => findUnderserved(designs, recentCutoff),
    [designs, recentCutoff],
  );

  return (
    <div className="space-y-8">
      <div className="text-sm text-muted">
        Planning view for the next <span className="text-foreground font-medium">{HORIZON_DAYS} days</span>.
        Use this to decide what to design before each upcoming season.
      </div>

      {/* Upcoming events grid */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">Upcoming events</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((s) => (
            <EventCard key={s.event.id} stat={s} />
          ))}
          {events.length === 0 && (
            <div className="text-sm text-muted">No events in the next {HORIZON_DAYS} days.</div>
          )}
        </div>
      </section>

      {/* Underserved themes */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">
          Underserved opportunities
        </h2>
        <div className="text-xs text-muted">
          Sub-themes that perform well historically (≥{UNDERSERVED_MIN_WIN_PCT}% Win)
          but where you&apos;ve added few new designs in the last 12 months. Sorted
          by opportunity = (Win %) × (designs lacking refresh).
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
                </tr>
              ))}
              {underserved.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted text-xs">
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

function EventCard({ stat }: { stat: EventStat }) {
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
        <div
          className={[
            "text-xs px-2 py-0.5 rounded",
            isClose ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-muted",
          ].join(" ")}
        >
          {stat.daysAway}d
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

      {stat.topDesigns.length > 0 && (
        <div className="text-xs text-muted border-t border-border pt-2">
          <div className="text-muted-2 uppercase tracking-wide mb-1">Top performers</div>
          <ul className="space-y-0.5">
            {stat.topDesigns.map((d) => (
              <li key={d.design_family} className="flex justify-between">
                <span className="truncate pr-2">{d.design_name || d.design_family}</span>
                <span className="tabular-nums shrink-0">{d.units_total.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tooFew && (
        <div className="text-xs text-loser bg-loser/5 rounded p-2">
          ⚡ Only {stat.freshDesigns} new design{stat.freshDesigns === 1 ? "" : "s"} in the last year — consider refreshing the lineup.
        </div>
      )}
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
    // Opportunity score: high Win % themes with FEW fresh designs are highest
    // priority. Multiply Win % by (1 / (1 + fresh)) so 0 fresh ranks above 5.
    r.opportunity = r.winPct / (1 + r.fresh);
    rows.push(r);
  }
  rows.sort((a, b) => b.opportunity - a.opportunity);
  return rows.slice(0, 20);
}

function matchesEvent(d: Design, event: SeasonalEvent): boolean {
  for (const m of event.matchers) {
    const arr = (d[m.field] || []) as string[];
    if (arr.includes(m.value)) return true;
  }
  return false;
}
