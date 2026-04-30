# AF Sales Research — User Guide

The dashboard answers one question: **Which AF designs succeeded since 2023, and what patterns explain why?**

Live URL: **https://af-sales-research.vercel.app**

---

## At a glance

When you open the dashboard you'll see, top to bottom:

1. **Year tabs** — All / Pre-2023 / 2023 / 2024 / 2025 / 2026 / Months ▾
2. **Six summary cards** — Designs · Hit · Solid · OK · Weak · Dead
3. **Filter bar** — Theme · Sub · Sub-sub · Tag · Type · View
4. **The grid** — every matching design as a tile

Click anything. Everything reacts to the current filters.

---

## What the bands mean

Every design is bucketed by lifetime units sold:

| Band | Units | What it means |
|---|---|---|
| **Hit** | 100+ | Top performers — the lessons. ~6% of designs. |
| **Solid** | 26–99 | Reliable sellers. ~21%. |
| **OK** | 6–25 | Pulled their weight. ~41%. |
| **Weak** | 1–5 | Sold trivially. ~26%. |
| **Dead** | 0 | Never sold. ~7%. |

Click any summary card to filter the grid to just that band.

---

## Filters (read left to right)

- **Theme / Sub / Sub-sub** — hierarchical (Birds → Cardinals → ...). Picking a parent narrows the child dropdown.
- **Tag** — raw Shopify tags. Use this if the theme taxonomy doesn't have what you want.
- **Type** — garden flag, house flag, garden banner.
- **View** — switches the main panel:
  - **All / Hit / Solid / OK / Weak / Dead** — grid of design tiles
  - **Patterns** — bar charts comparing Hits vs Weak/Dead
  - **Theme summary** — sortable table grouped by theme
  - **Planning** — *the bi-weekly brainstorm view (see below)*
- **Year tabs** — when a design was created (catalog Date Created, falls back to first sale date)
- **Months ▾** — *seasonal filter*; see "Filtering by month range" below
- **Clear** — wipes all filters

---

## Filtering by month range

The **Months ▾** button to the right of the 2026 year tab opens a popover with:

- **Two month dropdowns** — start month → end month
- **Year checkboxes** — which calendar years to count

Pick a window (e.g. **Nov → Dec**) and the years you care about (e.g. ☑ 2024, ☑ 2025), click **Apply**, and the dashboard re-scopes to designs that sold at least one unit in any of those (month, year) combinations.

Use cases:
- "What sold around Memorial Day in the last two years?" → **May–Jun**, ☑ 2024 ☑ 2025
- "Compare Christmas 2025 against Christmas 2024" → **Nov–Dec**, toggle each year and look at the in-range numbers on the tiles
- "What works in the dead of winter overall?" → **Jan–Feb**, all years checked

A few things to know:

- **No wrap-around.** End month must be after (or equal to) start month. To cross the year boundary, do it in two passes (e.g. look at Nov–Dec, then Jan–Feb).
- **Year tabs and month range are mutually exclusive.** Picking a year tab clears the range; applying a range resets the year tab to All.
- **Future months show a warning.** If today is April 2026 and you pick **May–Aug 2026**, the popover warns "May 2026 hasn't happened yet" because there's no data for those months — Apply still works, it just returns 0 for designs that haven't sold yet in that window.
- **Tiles re-rank.** With a range active, the grid sorts by units sold in that window (descending), so the strongest seasonal sellers come first regardless of lifetime volume.
- **Tiles show two numbers** — see "Reading a design tile" below.
- **Summary cards recompute** to show how many designs in each lifetime band (Hit / Solid / OK / Weak) had at least one sale in the window. Dead designs always show 0.

Click **Clear** inside the popover (or the global Clear filters button) to leave the range view.

---

## Reading a design tile

Each tile shows:

- **Garden flag image** at the top. Click to open the design detail modal with sales history chart.
- **Design name**
- **Variant SKUs** in monospace — e.g. `AFGFMS0278 / AFHFMS0278`. Click any SKU to open the JF Shopify admin search for that product.
- **Units** —
  - *Default view*: lifetime units **·** per-year velocity (see "How sales are calculated" below).
  - *With a month range active*: in-range units **·** lifetime total, e.g. `57 in May–Jun · 312 total`. The bold leading number is what the grid is sorted by.
- **Date** — when the design was added to the TeamDesk catalog (Date Created).

---

## How sales are calculated

Two numbers per tile: **total units** and **units per year**. Here's how each is built.

### Total units
A sum of every invoice line item for that design, across:
- **Every SKU variant** of the design family — garden (AFGF), house (AFHF), banner (AFGB), plus any preprint (`WH`), personalized (`-CF`), and monogram (letter) suffix variants.
- **Every sales channel we track** — FL (Flagsrus.org), JF (JustForFunFlags.com), FLAMZ (Amazon US), FL FBA (Amazon FBA), FL WFS + FL Walmart (merged into one Walmart bucket), AF Etsy + JF Etsy (merged).
- **The date window Jan 1 2023 → today.**

Skipped channels: `CA` (Canada wholesale) and `FLAMZ CAN` (Amazon Canada) — both excluded per the channel mapping.

**Important caveat**: the invoice export only goes back to Jan 1 2023. Designs that were already selling before 2023 don't have their pre-2023 sales counted — their "total units" reflects the 2023+ window only, not lifetime.

### Units per year (velocity)
```
clock_start      = catalog_created_date (preferred)
                   or first_sale_date (fallback for ~71 house-only designs)
days_since_start = max(30, today − clock_start in days)
rate             = total_units ÷ (days_since_start ÷ 365.25)
```

Floored at 30 days so a brand-new design with a few quick sales doesn't show an absurd rate like "500/yr" in its first week.

**Why velocity matters**: a 2020 design with 287 lifetime units (~47/yr over 6 years) is performing very differently than a 2024 design with the same 287 units (~133/yr over 2 years). The "/yr" number normalizes for how long the design has been on sale, which is what matters when comparing designs.

### Classification thresholds
The Hit / Solid / OK / Weak / Dead bands (see "What the bands mean" above) come from percentiles of your actual catalog distribution, not arbitrary numbers. The Hit band captures the top ~6%, so when a design is a Hit it's genuinely above the pack — not just "sold more than five."

---

## The four views

### Grid (default)
What you see by default. Filter it however you want.

### Patterns
Bar charts showing top tags and product type mix in your Hits vs your Weak+Dead designs. Use this to spot what visually-different categories perform vs flop.

### Theme summary
Sortable table. **Win %** = (Hit + Solid) / total designs in that theme. Higher Win % = a theme that reliably produces good products.

The view auto-drills:
- No filter → top-level themes (Birds, Patriotic, …)
- Picked a Theme → sub-themes within it
- Picked a Sub-theme → sub-sub-themes within it

### Planning (the recurring meeting view)
Built for your bi-weekly "what should we design next?" meeting.

Two sections:

**Upcoming events (next 180 days)** — one card per US holiday/season:
- Days away
- How many designs you have for it
- Win % across those designs
- Fresh designs added in last 12 months — **red if under 3** = "you're starving this event"
- Top sub-themes and sub-sub-themes within the event, ranked by Win %
- **View designs →** button to drill straight into them

**Underserved opportunities** — sub-themes that perform well historically but you've under-invested in lately. Top of this table = your highest-leverage design priorities.

**Suggested workflow:**
1. Open Planning view at the start of each meeting
2. Scan event cards for ⚡ red-flag warnings
3. Look at the Top Sub-themes inside those events — those are the formats that work
4. Look at the Underserved Opportunities table for additional ideas
5. Decide what to design

---

## Tips

- **Trust bigger sample sizes.** A sub-theme showing "67% Win · 3 designs" is noisy. "44% Win · 21 designs" is real.
- **Win % > Hit count** for theme strategy. Hit count tells you about viral home runs; Win % tells you about reliable producers.
- **Year tab + Theme summary** is a powerful combo — see what worked in 2024 vs what's working in 2025.
- The dashboard works on phones and tablets, but the Planning view is best on a laptop.

---

## Bug or question?

Tell Blake. The data refreshes when someone manually re-runs the import scripts — the dashboard does NOT auto-update from TeamDesk or Shopify in real time.
