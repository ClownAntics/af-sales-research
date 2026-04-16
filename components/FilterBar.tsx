"use client";

import type { DesignFilters, ViewFilter } from "@/lib/types";

const VIEWS: { value: ViewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hit", label: "Hits" },
  { value: "solid", label: "Solid" },
  { value: "ok", label: "OK" },
  { value: "weak", label: "Weak" },
  { value: "dead", label: "Dead" },
  { value: "patterns", label: "Patterns" },
  { value: "theme-summary", label: "Theme summary" },
  { value: "planning", label: "Planning" },
];

export function FilterBar({
  filters,
  tags,
  productTypes,
  themeNames,
  subThemes,
  subSubThemes,
  onChange,
  onClear,
}: {
  filters: DesignFilters;
  tags: string[];
  productTypes: string[];
  themeNames: string[];
  subThemes: string[];
  subSubThemes: string[];
  onChange: (next: Partial<DesignFilters>) => void;
  onClear: () => void;
}) {
  const dirty =
    filters.tag !== "all" ||
    filters.productType !== "all" ||
    filters.themeName !== "all" ||
    filters.subTheme !== "all" ||
    filters.subSubTheme !== "all" ||
    filters.view !== "all" ||
    filters.year !== "all";

  // Sub-theme dropdown is filtered by the active themeName.
  // Sub-sub-theme dropdown is filtered by the active subTheme (or themeName).
  const filteredSubThemes =
    filters.themeName === "all"
      ? subThemes
      : subThemes.filter((s) => s.startsWith(`${filters.themeName}: `));

  const filteredSubSubThemes =
    filters.subTheme !== "all"
      ? subSubThemes.filter((s) => s.startsWith(`${filters.subTheme}: `))
      : filters.themeName !== "all"
        ? subSubThemes.filter((s) => s.startsWith(`${filters.themeName}: `))
        : subSubThemes;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select
        value={filters.themeName}
        onChange={(v) =>
          onChange({ themeName: v, subTheme: "all", subSubTheme: "all" })
        }
        label="Theme"
        options={[
          { value: "all", label: "All themes" },
          ...themeNames.map((t) => ({ value: t, label: t })),
        ]}
      />
      <Select
        value={filters.subTheme}
        onChange={(v) => onChange({ subTheme: v, subSubTheme: "all" })}
        label="Sub"
        options={[
          { value: "all", label: "All sub-themes" },
          ...filteredSubThemes.map((t) => ({
            value: t,
            label: t.replace(/^[^:]+:\s*/, ""),
          })),
        ]}
      />
      <Select
        value={filters.subSubTheme}
        onChange={(v) => onChange({ subSubTheme: v })}
        label="Sub-sub"
        options={[
          { value: "all", label: "All sub-sub-themes" },
          ...filteredSubSubThemes.map((t) => ({
            value: t,
            label: t.split(": ").slice(-1)[0],
          })),
        ]}
      />
      <Select
        value={filters.tag}
        onChange={(v) => onChange({ tag: v })}
        label="Tag"
        options={[
          { value: "all", label: "All tags" },
          ...tags.map((t) => ({ value: t, label: t })),
        ]}
      />
      <Select
        value={filters.productType}
        onChange={(v) => onChange({ productType: v })}
        label="Type"
        options={[
          { value: "all", label: "All types" },
          ...productTypes.map((p) => ({ value: p, label: p })),
        ]}
      />
      <Select
        value={filters.view}
        onChange={(v) => onChange({ view: v as ViewFilter })}
        label="View"
        options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
      />
      {dirty && (
        <button
          onClick={onClear}
          className="text-sm text-muted hover:text-foreground px-2"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground max-w-[200px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
