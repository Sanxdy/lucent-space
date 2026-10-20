import { hueColor, initials } from "../lib/format";

type Props = {
  name: string;
  hue?: number | null;
  /** Avatar version string from the API; when set, the photo is shown instead of initials. */
  avatar?: string | null;
  id?: string | null;
  size?: "sm" | "" | "lg" | "xl";
  title?: string;
};

export function Avatar({ name, hue = 220, avatar, id, size = "", title }: Props) {
  const color = hueColor(hue ?? 220);
  const base = `avatar ${size}`.trim();
  const label = title ?? name;

  if (avatar && id) {
    // The version rides in the query string because the file is served with an
    // immutable cache header; a new photo gets a new URL.
    return (
      <span className={`${base} has-photo`} title={label} aria-label={name}>
        <img src={`/api/avatars/${id}?v=${encodeURIComponent(avatar)}`} alt="" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className={base}
      style={{ background: `linear-gradient(145deg, ${color}, ${color.replace("52%)", "34%)")})` }}
      title={label}
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
  people: { id: string; name: string; hue: number; avatar?: string | null }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} hue={p.hue} avatar={p.avatar} id={p.id} />
      ))}
      {people.length > max && (
        <span className="avatar sm" style={{ background: "var(--glass-inset)", color: "var(--text-3)" }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}
