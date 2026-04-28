import type { Design } from "@/lib/types";

const COLUMNS = [
  "design_family",
  "design_name",
  "product_types",
  "units_total",
  "first_sale_date",
  "date_is_estimated",
  "classification",
  "theme_code",
  "shopify_tags",
  "image_url",
] as const;

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(designs: Design[]): string {
  const lines = [COLUMNS.join(",")];
  for (const d of designs) {
    lines.push(COLUMNS.map((c) => escape(d[c as keyof Design])).join(","));
  }
  return lines.join("\r\n");
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function downloadDesignsCsv(
  designs: Design[],
  view: string,
  year: string,
): void {
  const csv = buildCsv(designs);
  const filename = `af_designs_${view}_${year}_${today()}.csv`;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
