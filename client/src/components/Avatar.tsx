import { hueColor, initials } from "../lib/format";

type Props = {
  name: string;
  hue?: number | null;
  size?: "sm" | "" | "lg" | "xl";
  title?: string;
};

export function Avatar({ name, hue = 220, size = "", title }: Props) {
  const color = hueColor(hue ?? 220);
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: `linear-gradient(145deg, ${color}, ${color.replace("52%)", "34%)")})` }}
      title={title ?? name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
}: {
  people: { id: string; name: string; hue: number }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} hue={p.hue} />
      ))}
      {people.length > max && (
        <span className="avatar sm" style={{ background: "var(--glass-inset)", color: "var(--text-3)" }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}
