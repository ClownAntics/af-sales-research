/**
 * Decompose each design's flat shopify_tags into hierarchical theme columns
 * by looking each tag up in the FL Themes taxonomy export.
 *
 * Run AFTER import-jf-tags.ts (needs shopify_tags populated).
 *
 * Mapping rule:
 *   - Each FL Themes row has a `Search Term` (matches tag text, case-insensitive),
 *     plus `Name`, `Sub Theme`, `Sub Sub Theme`, `Level`.
 *   - Level 1 → contributes to theme_names = [Name]
 *   - Level 2 → contributes to theme_names = [Name], sub_themes = [Name: Sub Theme]
 *   - Level 3 → contributes to theme_names + sub_themes + sub_sub_themes (full path)
 *   - Tags with no matching theme are silently ignored.
 *
 * Usage:
 *   npx tsx scripts/import-themes.ts                  # uses DEFAULT_CSV
 *   npx tsx scripts/import-themes.ts ./data/foo.csv
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { getAdminClient } from "./_supabase-admin";

const DEFAULT_CSV =
  "C:/Users/gbcab/ClownAntics Dropbox/Blake Cabot/Docs/Internet Business/200904 Clown/202604 AF Research App/FL Themes_zz Export View.csv";

interface ThemeEntry {
  level: number;
  name: string;
  subTheme: string | null;
  subSubTheme: string | null;
}

function normTag(t: string): string {
  // Tags are matched case-insensitively, with hyphens/spaces collapsed so
  // "beaches-nautical" matches "Beaches-Nautical" matches "Beaches Nautical".
  return t.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

async function main() {
  const csvPath = resolve(process.argv[2] || DEFAULT_CSV);
  console.log(`Reading: ${csvPath}\n`);

  // Build the lookup table: normalised search term → ThemeEntry.
  const lookup = new Map<string, ThemeEntry>();
  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  let themeRows = 0;
  for await (const r of parser as AsyncIterable<Record<string, string>>) {
    themeRows++;
    const searchTerm = (r["Search Term"] || "").trim();
    if (!searchTerm) continue;
    const level = Math.round(Number(r["Level"] || "0"));
    const name = (r["Name"] || "").trim();
    const subTheme = (r["Sub Theme"] || "").trim() || null;
    const subSubTheme = (r["Sub Sub Theme"] || "").trim() || null;
    if (!name) continue;
    lookup.set(normTag(searchTerm), { level, name, subTheme, subSubTheme });
  }
  console.log(`Loaded ${themeRows} theme rows → ${lookup.size} unique search terms.\n`);

  // Pull every design with shopify_tags and compute its theme columns.
  const sb = getAdminClient();
  const designs: { design_family: string; shopify_tags: string[] | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("designs")
      .select("design_family,shopify_tags")
      .order("design_family", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const rows = (data || []) as typeof designs;
    designs.push(...rows);
    if (rows.length < 1000) break;
  }
  console.log(`Loaded ${designs.length} designs.\n`);

  let hits = 0;
  let misses = 0;
  const missedTags = new Map<string, number>();

  const updates = designs.map((d) => {
    const themeNames = new Set<string>();
    const subThemes = new Set<string>();
    const subSubs = new Set<string>();

    for (const tag of d.shopify_tags || []) {
      const entry = lookup.get(normTag(tag));
      if (!entry) {
        misses++;
        missedTags.set(tag, (missedTags.get(tag) || 0) + 1);
        continue;
      }
      hits++;
      themeNames.add(entry.name);
      if (entry.subTheme) subThemes.add(`${entry.name}: ${entry.subTheme}`);
      if (entry.subSubTheme && entry.subTheme) {
        subSubs.add(`${entry.name}: ${entry.subTheme}: ${entry.subSubTheme}`);
      }
    }

    return {
      design_family: d.design_family,
      theme_names: Array.from(themeNames).sort(),
      sub_themes: Array.from(subThemes).sort(),
      sub_sub_themes: Array.from(subSubs).sort(),
    };
  });

  console.log(`Tag matches: ${hits} hits, ${misses} unmatched`);
  if (missedTags.size > 0) {
    console.log(`\nTop 15 unmatched tags (these are tags not in FL Themes):`);
    Array.from(missedTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([tag, n]) => console.log(`  ${String(n).padStart(4)}  ${tag}`));
  }
  console.log("");

  console.log(`Updating ${updates.length} designs…`);
  let i = 0;
  for (const u of updates) {
    const { error } = await sb
      .from("designs")
      .update({
        theme_names: u.theme_names,
        sub_themes: u.sub_themes,
        sub_sub_themes: u.sub_sub_themes,
      })
      .eq("design_family", u.design_family);
    if (error) console.warn(`  ! ${u.design_family}: ${error.message}`);
    i++;
    if (i % 200 === 0) process.stdout.write(`  ${i}/${updates.length}\r`);
  }
  console.log(`  ${i}/${updates.length}`);
  console.log("\nDone. Run: npx tsx scripts/classify.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
