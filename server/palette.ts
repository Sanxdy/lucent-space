const COLORS: Record<string, string> = {
  blue: "#6ea8ff",
  purple: "#a78bfa",
  pink: "#f472b6",
  orange: "#fb923c",
  green: "#4ade80",
  teal: "#2dd4bf",
  yellow: "#facc15",
  graphite: "#94a3b8",
};

/** Seeded projects store palette names; newer ones store hex. Normalize on read. */
export const projectColor = (value: unknown) =>
  typeof value === "string" ? (COLORS[value] ?? value) : "#6ea8ff";
