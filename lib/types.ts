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

export interface DesignFilters {
  year: string;         // 'all' | '2023' | '2024' | '2025' | '2026'
  tag: string;          // 'all' | <tag>
  productType: string;  // 'all' | 'garden' | 'house' | 'garden-banner'
  themeName: string;    // 'all' | <Name>
  subTheme: string;     // 'all' | 'Name: Sub'
  subSubTheme: string;  // 'all' | 'Name: Sub: SubSub'
  view: ViewFilter;
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
