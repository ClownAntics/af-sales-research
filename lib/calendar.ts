/**
 * Seasonal events calendar for the Planning view.
 *
 * Each event maps to one or more theme labels in the database (theme_names,
 * sub_themes, or sub_sub_themes). The Planning view uses these to compute
 * "for this upcoming event, here's how your designs perform and where the
 * coverage gaps are."
 *
 * The label strings here MUST match what's actually in the DB after
 * `import-themes.ts` runs (verified against the FL Themes export taxonomy).
 */

export interface SeasonalEvent {
  id: string;
  name: string;
  emoji: string;
  /** Returns the date for the given calendar year. */
  dateInYear: (year: number) => Date;
  /**
   * Theme matchers — a design counts as "relevant" if any of its
   * theme_names / sub_themes / sub_sub_themes / shopify_tags match.
   * The first matcher is also the "primary" — used by the dashboard's
   * "View designs" link to switch to the grid view filtered on this event.
   */
  matchers: ThemeMatcher[];
}

export interface ThemeMatcher {
  field: "theme_names" | "sub_themes" | "sub_sub_themes" | "shopify_tags";
  value: string;
}

/**
 * Maps a matcher onto the dashboard's filter state. Used by the
 * "View designs" button on each event card. Returns the partial filter
 * update that page.tsx should apply.
 */
export function matcherToFilter(m: ThemeMatcher): {
  themeName?: string;
  subTheme?: string;
  subSubTheme?: string;
  tag?: string;
} {
  switch (m.field) {
    case "theme_names":
      return { themeName: m.value };
    case "sub_themes":
      return { themeName: m.value.split(":")[0].trim(), subTheme: m.value };
    case "sub_sub_themes": {
      const parts = m.value.split(":").map((s) => s.trim());
      const themeName = parts[0];
      const subTheme = `${parts[0]}: ${parts[1]}`;
      return { themeName, subTheme, subSubTheme: m.value };
    }
    case "shopify_tags":
      return { tag: m.value };
  }
}

// ---------- date helpers ----------

/** Nth weekday of a month. weekday: 0=Sun..6=Sat. n: 1=first, 2=second, etc. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + offset + (n - 1) * 7));
}

/** Last weekday of a month. */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  // Day 0 of next month = last day of this month
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month0, last.getUTCDate() - offset));
}

/** Anonymous Gregorian Easter algorithm. Returns Easter Sunday in UTC. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const fixedDate = (month0: number, day: number) => (year: number) =>
  new Date(Date.UTC(year, month0, day));

// ---------- event definitions ----------
// Listed roughly in calendar order. The matcher labels are the actual strings
// stored in the DB (verified Apr 2026 — see lib/calendar-themes.md if you need
// to update).

export const EVENTS: SeasonalEvent[] = [
  {
    id: "new-year",
    name: "New Year",
    emoji: "🎉",
    dateInYear: fixedDate(0, 1),
    matchers: [{ field: "sub_themes", value: "Seasonal: New Year" }],
  },
  {
    id: "valentines",
    name: "Valentine's Day",
    emoji: "💝",
    dateInYear: fixedDate(1, 14),
    matchers: [{ field: "sub_themes", value: "Seasonal: Valentine's Day" }],
  },
  {
    id: "presidents-day",
    name: "Presidents' Day",
    emoji: "🇺🇸",
    dateInYear: (y) => nthWeekday(y, 1, 1, 3),
    // No specific seasonal sub-theme exists — fall back to broad Patriotic.
    matchers: [{ field: "theme_names", value: "Patriotic" }],
  },
  {
    id: "st-patricks",
    name: "St. Patrick's Day",
    emoji: "🍀",
    dateInYear: fixedDate(2, 17),
    matchers: [{ field: "sub_themes", value: "Seasonal: St. Patrick's Day" }],
  },
  {
    id: "spring",
    name: "Spring begins",
    emoji: "🌸",
    dateInYear: fixedDate(2, 20),
    matchers: [
      { field: "sub_themes", value: "Seasonal: Spring" },
      { field: "sub_themes", value: "Flowers: Spring Flowers" },
    ],
  },
  {
    id: "easter",
    name: "Easter",
    emoji: "🐰",
    dateInYear: easter,
    matchers: [{ field: "sub_themes", value: "Seasonal: Easter" }],
  },
  {
    id: "earth-day",
    name: "Earth Day",
    emoji: "🌎",
    dateInYear: fixedDate(3, 22),
    matchers: [{ field: "theme_names", value: "Earth" }],
  },
  {
    id: "mothers-day",
    name: "Mother's Day",
    emoji: "💐",
    dateInYear: (y) => nthWeekday(y, 4, 0, 2),
    matchers: [{ field: "sub_themes", value: "Seasonal: Mother's Day" }],
  },
  {
    id: "memorial-day",
    name: "Memorial Day",
    emoji: "🇺🇸",
    dateInYear: (y) => lastWeekday(y, 4, 1),
    matchers: [
      { field: "sub_themes", value: "Seasonal: Memorial Day" },
      { field: "sub_themes", value: "Religious: Memorial" },
    ],
  },
  {
    id: "fathers-day",
    name: "Father's Day",
    emoji: "👔",
    dateInYear: (y) => nthWeekday(y, 5, 0, 3),
    matchers: [{ field: "sub_themes", value: "Seasonal: Father's Day" }],
  },
  {
    id: "summer",
    name: "Summer begins",
    emoji: "☀️",
    dateInYear: fixedDate(5, 21),
    matchers: [{ field: "sub_themes", value: "Seasonal: Summer" }],
  },
  {
    id: "july-4th",
    name: "4th of July",
    emoji: "🎆",
    dateInYear: fixedDate(6, 4),
    matchers: [{ field: "sub_themes", value: "Seasonal: 4th of July" }],
  },
  {
    id: "labor-day",
    name: "Labor Day",
    emoji: "🛠️",
    dateInYear: (y) => nthWeekday(y, 8, 1, 1),
    // No specific seasonal sub-theme exists — fall back to broad Patriotic.
    matchers: [{ field: "theme_names", value: "Patriotic" }],
  },
  {
    id: "fall",
    name: "Fall begins",
    emoji: "🍂",
    dateInYear: fixedDate(8, 22),
    matchers: [{ field: "sub_themes", value: "Seasonal: Fall" }],
  },
  {
    id: "halloween",
    name: "Halloween",
    emoji: "🎃",
    dateInYear: fixedDate(9, 31),
    matchers: [{ field: "sub_themes", value: "Seasonal: Halloween" }],
  },
  {
    id: "veterans-day",
    name: "Veterans Day",
    emoji: "🪖",
    dateInYear: fixedDate(10, 11),
    matchers: [{ field: "sub_themes", value: "Military: Veterans" }],
  },
  {
    id: "thanksgiving",
    name: "Thanksgiving",
    emoji: "🦃",
    dateInYear: (y) => nthWeekday(y, 10, 4, 4),
    matchers: [{ field: "sub_themes", value: "Seasonal: Thanksgiving" }],
  },
  {
    id: "christmas",
    name: "Christmas",
    emoji: "🎄",
    dateInYear: fixedDate(11, 25),
    matchers: [
      { field: "sub_themes", value: "Seasonal: Christmas" },
      { field: "sub_themes", value: "Seasonal: Christmas Decorations" },
      { field: "sub_themes", value: "Seasonal: Christmas Religious" },
    ],
  },
  {
    id: "winter",
    name: "Winter begins",
    emoji: "❄️",
    dateInYear: fixedDate(11, 21),
    matchers: [{ field: "sub_themes", value: "Seasonal: Winter" }],
  },
];

/**
 * Returns events whose next occurrence falls within the next `days` from `now`,
 * sorted by date ascending. Each event yields its NEXT occurrence — so on
 * 2026-04-16, "Christmas" returns Dec 25, 2026.
 */
export function upcomingEvents(
  now: Date,
  days: number,
): { event: SeasonalEvent; date: Date; daysAway: number }[] {
  const horizon = new Date(now.getTime() + days * 86400000);
  const out: { event: SeasonalEvent; date: Date; daysAway: number }[] = [];
  for (const e of EVENTS) {
    // Try this year and next year — pick the next future occurrence.
    const candidates = [
      e.dateInYear(now.getUTCFullYear()),
      e.dateInYear(now.getUTCFullYear() + 1),
    ];
    const next = candidates.find((d) => d.getTime() >= now.getTime());
    if (!next || next.getTime() > horizon.getTime()) continue;
    out.push({
      event: e,
      date: next,
      daysAway: Math.round((next.getTime() - now.getTime()) / 86400000),
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}
