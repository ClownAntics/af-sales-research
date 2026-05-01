export type Classification = "hit" | "solid" | "ok" | "weak" | "dead";

export interface Design {
  design_family: string;
  design_name: string | null;
  product_types: string[] | null;
  image_url: string | null;
  first_sale_date: string | null;
  last_sale_date: string | null;
  catalog_created_date: string | null;
  date_is_estimated: boolean;
  is_active: boolean;
  theme_code: string | null;
  sku_number: number | null;
  units_total: number;
  units_fl: number;
  units_jf: number;
  units_flamz: number;
  units_fl_fba: number;
  units_fl_walmart: number;
  units_af_etsy: number;
  shopify_tags: string[] | null;
  theme_names: string[] | null;
  sub_themes: string[] | null;
  sub_sub_themes: string[] | null;
  has_preprint: boolean;
  has_personalized: boolean;
  has_monogram: boolean;
  classification: Classification | null;
  /** Per-month units, sorted ascending. Zero-sales months omitted.
   *  `monthly_sales` is the family aggregate (all variants combined).
   *  The variant-specific siblings are nullable when no sales of that
   *  variant exist for the design. */
  monthly_sales?: MonthlyPoint[] | null;
  monthly_sales_garden?: MonthlyPoint[] | null;
  monthly_sales_house?: MonthlyPoint[] | null;
  monthly_sales_garden_banner?: MonthlyPoint[] | null;
}

export interface MonthlyPoint {
  m: string; // 'YYYY-MM'
  u: number;
}

export interface SkuVariant {
  sku: string;
  design_family: string;
  variant_type: "none" | "preprint" | "personalized" | "monogram";
  product_type: "garden" | "house" | "garden-banner" | "unknown";
}

export interface SummaryCounts {
  total: number;
  hit: number;
  solid: number;
  ok: number;
  weak: number;
  dead: number;
}

export type ViewFilter =
  | "all"
  | "hit"
  | "solid"
  | "ok"
  | "weak"
  | "dead"
  | "patterns"
  | "theme-summary"
  | "planning";

export interface MonthRange {
  /** 1 = Jan … 12 = Dec. `end` must be >= `start` (no wrap-around). */
  start: number;
  end: number;
  /** Calendar years to include. Empty array = no matches. */
  years: number[];
}

export interface DesignFilters {
  year: string;         // 'all' | '2023' | '2024' | '2025' | '2026'
  tag: string;          // 'all' | <tag>
  productType: string;  // 'all' | 'garden' | 'house' | 'garden-banner'
  themeName: string;    // 'all' | <Name>
  subTheme: string;     // 'all' | 'Name: Sub'
  subSubTheme: string;  // 'all' | 'Name: Sub: SubSub'
  search: string;       // free-text: SKU, design_family, or design_name substring
  view: ViewFilter;
  /** Year-agnostic month window — keeps designs with ≥1 sale in any year whose
   *  month-of-year falls in [start,end]. Mutually exclusive with `year`. */
  monthRange: MonthRange | null;
}

export interface DesignsResponse {
  designs: Design[];
  summary: SummaryCounts;
  tags: string[];          // distinct tags for filter dropdown
  productTypes: string[];
  themeNames: string[];
  subThemes: string[];
  subSubThemes: string[];
}
