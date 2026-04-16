import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type {
  Design,
  DesignsResponse,
  SummaryCounts,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000; // Supabase default max-rows
const MAX_DESIGNS = 5000;

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const filters: BaseFilters = {
    year: sp.get("year") || "all",
    tag: sp.get("tag") || "all",
    productType: sp.get("productType") || "all",
    themeName: sp.get("themeName") || "all",
    subTheme: sp.get("subTheme") || "all",
    subSubTheme: sp.get("subSubTheme") || "all",
  };
  const view = sp.get("view") || "all";

  const supabase = getSupabase();

  const summary = await getSummary(supabase, filters);
  const designs = await fetchDesigns(supabase, filters, view);

  // Build distinct dropdown values from the result slice.
  const tagSet = new Set<string>();
  const ptSet = new Set<string>();
  const themeSet = new Set<string>();
  const subSet = new Set<string>();
  const subSubSet = new Set<string>();
  for (const d of designs) {
    for (const t of d.shopify_tags || []) tagSet.add(t);
    for (const p of d.product_types || []) ptSet.add(p);
    for (const t of d.theme_names || []) themeSet.add(t);
    for (const t of d.sub_themes || []) subSet.add(t);
    for (const t of d.sub_sub_themes || []) subSubSet.add(t);
  }

  const body: DesignsResponse = {
    designs,
    summary,
    tags: Array.from(tagSet).sort(),
    productTypes: Array.from(ptSet).sort(),
    themeNames: Array.from(themeSet).sort(),
    subThemes: Array.from(subSet).sort(),
    subSubThemes: Array.from(subSubSet).sort(),
  };
  return Response.json(body);
}

interface BaseFilters {
  year: string;
  tag: string;
  productType: string;
  themeName: string;
  subTheme: string;
  subSubTheme: string;
}

// Supabase's query types are too deep for TS to infer through a generic helper,
// so we use `unknown` here and rely on the runtime PostgREST chain.
type Q = {
  gte: (col: string, v: string) => Q;
  lte: (col: string, v: string) => Q;
  contains: (col: string, v: string[]) => Q;
  eq: (col: string, v: string) => Q;
};

function applyFilters(q: Q, f: BaseFilters): Q {
  let r = q;
  if (f.year === "pre-2023") {
    r = r.lte("effective_date", "2022-12-31");
  } else if (f.year !== "all") {
    r = r.gte("effective_date", `${f.year}-01-01`).lte("effective_date", `${f.year}-12-31`);
  }
  if (f.tag !== "all") r = r.contains("shopify_tags", [f.tag]);
  if (f.productType !== "all") r = r.contains("product_types", [f.productType]);
  if (f.themeName !== "all") r = r.contains("theme_names", [f.themeName]);
  if (f.subTheme !== "all") r = r.contains("sub_themes", [f.subTheme]);
  if (f.subSubTheme !== "all") r = r.contains("sub_sub_themes", [f.subSubTheme]);
  return r;
}

async function getSummary(
  supabase: SupabaseClient,
  f: BaseFilters,
): Promise<SummaryCounts> {
  const head = () =>
    supabase.from("designs").select("*", { count: "exact", head: true }) as unknown as Q & {
      then: PromiseLike<{ count: number | null; error: { message: string } | null }>["then"];
    };

  const totalP = applyFilters(head(), f) as unknown as Promise<{ count: number | null }>;
  const hitP = applyFilters(head().eq("classification", "hit"), f) as unknown as Promise<{ count: number | null }>;
  const solidP = applyFilters(head().eq("classification", "solid"), f) as unknown as Promise<{ count: number | null }>;
  const okP = applyFilters(head().eq("classification", "ok"), f) as unknown as Promise<{ count: number | null }>;
  const weakP = applyFilters(head().eq("classification", "weak"), f) as unknown as Promise<{ count: number | null }>;
  const deadP = applyFilters(head().eq("classification", "dead"), f) as unknown as Promise<{ count: number | null }>;

  const [t, h, s, o, w, d] = await Promise.all([totalP, hitP, solidP, okP, weakP, deadP]);
  return {
    total: t.count ?? 0,
    hit: h.count ?? 0,
    solid: s.count ?? 0,
    ok: o.count ?? 0,
    weak: w.count ?? 0,
    dead: d.count ?? 0,
  };
}

async function fetchDesigns(
  supabase: SupabaseClient,
  f: BaseFilters,
  view: string,
): Promise<Design[]> {
  const out: Design[] = [];
  for (let offset = 0; offset < MAX_DESIGNS; offset += PAGE_SIZE) {
    const base = supabase.from("designs").select("*") as unknown as Q;
    let q = applyFilters(base, f);
    if (["hit", "solid", "ok", "weak", "dead"].includes(view)) {
      q = q.eq("classification", view);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordered = (q as any)
      .order("units_total", { ascending: false })
      .order("design_family", { ascending: true });
    const { data, error } = await ordered.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as Design[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
