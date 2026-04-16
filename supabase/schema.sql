-- AF Sales Research — Supabase schema
-- Run this in the Supabase SQL editor before running any import script.

create table if not exists designs (
  design_family            text primary key,
  design_name              text,
  product_types            text[],                  -- ['garden','house']
  image_url                text,
  first_sale_date          date,                    -- real first sale (NULL if never sold)
  last_sale_date           date,
  catalog_created_date     date,                    -- TeamDesk's "Date Created" from the product catalog
  date_is_estimated        boolean not null default false, -- true when only catalog_created_date is known (no sales)
  is_active                boolean not null default true,
  theme_code               text,                    -- 'SP', 'SU', 'FA', 'WR', 'MS', 'US', 'UK'
  sku_number               int,                     -- numeric tail (e.g. 662 from AFSP0662)
  units_total              int  not null default 0,
  units_fl                 int  not null default 0,
  units_jf                 int  not null default 0,
  units_flamz              int  not null default 0,
  units_fl_fba             int  not null default 0,
  units_fl_walmart         int  not null default 0,
  units_af_etsy            int  not null default 0,
  shopify_tags             text[],
  theme_names              text[],                  -- top-level themes from FL Themes lookup (e.g. ['Patriotic','Birds'])
  sub_themes               text[],                  -- 'Name: Sub Theme' (e.g. ['Birds: Cardinals'])
  sub_sub_themes           text[],                  -- 'Name: Sub: Sub Sub' (e.g. ['Flowers: Spring Flowers: Hydrangeas'])
  has_preprint             boolean not null default false,
  has_personalized         boolean not null default false,
  has_monogram             boolean not null default false,
  classification           text                     -- 'winner' | 'middle' | 'loser'
);

create table if not exists sku_variants (
  sku            text primary key,
  design_family  text references designs(design_family) on delete cascade,
  variant_type   text,                     -- none | preprint | personalized | monogram
  product_type   text                      -- garden | house | garden-banner | unknown
);

-- Effective date for year filtering: catalog Date Created if present (= when
-- the design was actually added to the catalog), else fall back to
-- first_sale_date for the ~71 house/banner-only designs missing from catalog.
alter table designs
  add column if not exists effective_date date
  generated always as (coalesce(catalog_created_date, first_sale_date)) stored;

create index if not exists idx_classification  on designs(classification);
create index if not exists idx_first_sale      on designs(first_sale_date);
create index if not exists idx_effective_date  on designs(effective_date);
create index if not exists idx_tags            on designs using gin(shopify_tags);
create index if not exists idx_types           on designs using gin(product_types);
create index if not exists idx_theme_names     on designs using gin(theme_names);
create index if not exists idx_sub_themes      on designs using gin(sub_themes);
create index if not exists idx_sub_sub_themes  on designs using gin(sub_sub_themes);
create index if not exists idx_theme_code      on designs(theme_code);
create index if not exists idx_is_active       on designs(is_active);

-- MVP: enable RLS but allow public SELECT. Writes go through the service role
-- key from the import scripts (which bypasses RLS).
alter table designs       enable row level security;
alter table sku_variants  enable row level security;

drop policy if exists "Public read designs"      on designs;
drop policy if exists "Public read sku_variants" on sku_variants;

create policy "Public read designs"
  on designs for select
  to anon, authenticated
  using (true);

create policy "Public read sku_variants"
  on sku_variants for select
  to anon, authenticated
  using (true);
