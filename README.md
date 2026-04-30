# AF Sales Research

Internal dashboard answering: **Which AF designs succeeded since 2023, and what patterns explain why?**

Stack: Next.js 16 (App Router) + Tailwind v4 + Supabase. Visual target and SKU rules live in [CLAUDE.md](./CLAUDE.md).

## One-time setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` → `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # from API settings → anon public
   SUPABASE_SERVICE_ROLE_KEY=eyJ...            # from API settings → service_role (NEVER ship to browser)
   ```

## Load data

Run in this order:

```bash
npx tsx scripts/import-catalog.ts          # seeds designs from AFGF active SKUs
npx tsx scripts/import-teamdesk.ts         # ~90k invoice rows → designs + sku_variants
npx tsx scripts/import-jf-tags.ts          # adds shopify_tags, deletes Ukraine designs
npx tsx scripts/import-themes.ts           # decomposes tags into theme hierarchy
npx tsx scripts/import-monthly-sales.ts    # builds monthly_sales jsonb (powers Months ▾ filter + sales chart)
npx tsx scripts/rebuild-product-types.ts   # rebuilds designs.product_types from sku_variants (keeps Type=house honest)
npx tsx scripts/classify.ts                # sets classification + has_* flags
```

CSV paths default to the absolute paths in the parent docs folder. Override by passing a path arg.

> **Faster classify**: open `scripts/classify.ts` — the bottom of the file has equivalent SQL you can paste directly into the Supabase SQL editor.

For end-user instructions on refreshing data (CSV exports, where files live, common errors), see [docs/DATA_UPDATE.md](./docs/DATA_UPDATE.md).

## Run

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run build
```

## Deploy (Vercel)

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# do NOT add the service-role key to Vercel — it's only used by local import scripts
vercel deploy --prod
```

Then enable Vercel password protection in project settings (Phase 1 auth).

## Project layout

```
af-sales-research/
├── app/
│   ├── api/designs/route.ts    # GET /api/designs?year=&tag=&productType=&view=&themeName=...
│   ├── layout.tsx
│   └── page.tsx                # client dashboard (search + month-range filter live here)
├── components/                 # YearTabs, SummaryCards, FilterBar, DesignGrid, DesignCard,
│                               # DetailModal, PatternCharts, ThemeSummary, PlanningView
├── lib/
│   ├── calendar.ts             # US holiday + season dates for the Planning view
│   ├── csv-export.ts           # client-side CSV download for the current grid
│   ├── month-range.ts          # year-agnostic month-range helpers (shared by YearTabs + cards + page)
│   ├── sku-parser.ts           # pure parser — see CLAUDE.md for rules
│   ├── supabase.ts             # anon-key client (browser + API route)
│   └── types.ts
├── scripts/
│   ├── _supabase-admin.ts          # service-role client (import-only)
│   ├── import-catalog.ts
│   ├── import-teamdesk.ts
│   ├── import-jf-tags.ts
│   ├── import-themes.ts
│   ├── import-monthly-sales.ts     # builds designs.monthly_sales jsonb
│   ├── rebuild-product-types.ts    # rebuilds designs.product_types from sku_variants
│   └── classify.ts
└── supabase/
    └── schema.sql
```
