import { useEffect, useRef, useState } from "react";
import { Seg } from "../components/Seg";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useStore, useWorkspace } from "../store";
import { Avatar } from "../components/Avatar";
import {
  IconAlert,
  IconBell,
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconLogOut,
  IconMoon,
  IconRefresh,
  IconShapes,
  IconSun,
  IconTimer,
  IconUser,
} from "../components/Icons";
import type { Accent, Wall } from "../types";

const SECTIONS = [
  { id: "profile", label: "Profile", Icon: IconUser, hue: "#5b8def" },
  {
    id: "notifications",
    label: "Notifications",
    Icon: IconBell,
    hue: "#f06aa8",
  },
  { id: "appearance", label: "Appearance", Icon: IconSun, hue: "#a78bfa" },
  { id: "focus", label: "Focus", Icon: IconTimer, hue: "#fb923c" },
  { id: "data", label: "Data", Icon: IconDownload, hue: "#2dd4bf" },
] as const;

const WALLS: { id: Wall; label: string; a: string; b: string; blob: string }[] = [
  { id: "ash", label: "Ash", a: "#191920", b: "#08080b", blob: "#5a6082" },
  {
    id: "smoke",
    label: "Smoke",
    a: "#202027",
    b: "#0b0b0e",
    blob: "#787a87",
  },
  { id: "dusk", label: "Dusk", a: "#241c31", b: "#0d0a12", blob: "#966ec8" },
  {
    id: "aurora",
    label: "Aurora",
    a: "#0c1a24",
    b: "#060b10",
    blob: "#40c8be",
  },
  {
    id: "bloom",
    label: "Bloom",
    a: "#2a1520",
    b: "#100810",
    blob: "#e66e96",
  },
  {
    id: "ember",
    label: "Ember",
    a: "#24170f",
    b: "#0e0907",
    blob: "#e68246",
  },
  {
    id: "grove",
    label: "Grove",
    a: "#101f18",
    b: "#060d0a",
    blob: "#50b478",
  },
  { id: "tide", label: "Tide", a: "#0d1c28", b: "#050d13", blob: "#3c96d2" },
];

const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "blue", label: "Blue", color: "#6ea8ff" },
  { id: "purple", label: "Purple", color: "#a78bfa" },
  { id: "pink", label: "Pink", color: "#f472b6" },
  { id: "orange", label: "Orange", color: "#fb923c" },
  { id: "green", label: "Green", color: "#4ade80" },
  { id: "teal", label: "Teal", color: "#2dd4bf" },
  { id: "graphite", label: "Graphite", color: "#c7c9d4" },
];

const NOTIFY_ROWS = [
  ["assigned", "Mentions", "When someone @mentions you", "#5b8def"],
  ["comments", "Comments", "Replies on tasks you follow", "#f06aa8"],
  ["due", "Due dates", "The morning a task of yours is due", "#fb923c"],
  ["weekly", "Daily digest", "One summary at 9:00 AM", "#2dd4bf"],
  ["product", "Focus finished", "When a session ends", "#a78bfa"],
] as const;

function Tile({ hue, children }: { hue: string; children: React.ReactNode }) {
  return (
    <span className="set-tile" style={{ ["--hue" as string]: hue }}>
      {children}
    </span>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = Number(draft);
      if (draft.trim() === "" || !Number.isFinite(next)) return;
      const clamped = Math.min(max, Math.max(min, Math.round(next)));
      if (clamped !== value) onCommit(clamped);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, value, min, max, onCommit]);

  return (
    <input
      id={id}
      className="input"
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      style={{ width: 84 }}
      aria-label={label}
    />
  );
}

/**
 * Shrink a picked photo to a 256px square JPEG in the browser, so the server
 * needs no image library and the upload stays tiny.
 */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that image.");
  // Centre-crop to a square, then scale down in one draw.
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, 256, 256,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function Settings() {
  const { section = "profile" } = useParams();
  const workspace = useWorkspace();
  const { me, updateSettings, updateProfile, refresh, signOut, toast } = useStore();
  const [profile, setProfile] = useState({
    name: me?.name ?? "",
    email: me?.email ?? "",
    role: me?.role ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const dataUrl = await downscale(file);
      await api.uploadAvatar(dataUrl);
      await refresh();
      toast("Photo updated");
    } catch (caught) {
      setPhotoError(caught instanceof Error ? caught.message : "Could not save that photo");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await api.deleteAvatar();
      await refresh();
      toast("Photo removed");
    } catch (caught) {
      setPhotoError(caught instanceof Error ? caught.message : "Could not remove that photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  if (!SECTIONS.some((item) => item.id === section)) return <Navigate to="/settings/profile" replace />;

  const notify = workspace.settings.notify ?? {};

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateProfile(profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile");
      nameRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) =>
    void updateSettings({
      notify: { ...notify, [key]: notify[key] === false },
    });

  const notifyCard = (
    <section className="panel glass">
      <h2>Notifications</h2>
      <p className="panel-desc">What Lucent taps you on the shoulder for</p>
      <div className="panel-body">
        {NOTIFY_ROWS.map(([key, title, description, hue]) => (
          <div key={key} className="set-row">
            <Tile hue={hue}>
              <IconBell size={15} />
            </Tile>
            <div className="sr-copy">
              <strong>{title}</strong>
              <span>{description}</span>
            </div>
            <button className="switch" role="switch" aria-checked={notify[key] !== false} aria-label={title} onClick={() => toggle(key)} />
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">Settings</h1>
          <p className="sub">Your profile, the look of Lucent, and when it nudges you</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav glass" aria-label="Settings sections">
          <div className="sn-id">
            <Avatar name={me?.name ?? ""} hue={me?.hue ?? 212} avatar={me?.avatar} id={me?.id} size="lg" />
            <div>
              <strong>{me?.name}</strong>
              <span>{me?.email}</span>
            </div>
          </div>
          <div className="sn-list">
            {SECTIONS.map((item) => (
              <NavLink key={item.id} to={`/settings/${item.id}`} className={({ isActive }) => (isActive ? "active" : "")}>
                <Tile hue={item.hue}>
                  <item.Icon size={15} />
                </Tile>
                <span className="sn-label">{item.label}</span>
                <IconChevronRight size={15} className="sn-chev" />
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="settings-main">
          {section === "profile" && (
          <section className="panel glass">
            <h2>Profile</h2>
            <p className="panel-desc">How the team sees you</p>
            <div className="profile-hero">
              <button
                type="button"
                className="avatar-edit"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                aria-label={me?.avatar ? "Change profile photo" : "Add profile photo"}
                title={me?.avatar ? "Change profile photo" : "Add profile photo"}
              >
                <Avatar name={me?.name ?? ""} hue={me?.hue ?? 212} avatar={me?.avatar} id={me?.id} size="xl" />
                <span className="avatar-edit-badge">{photoBusy ? "…" : me?.avatar ? "Change" : "Add"}</span>
              </button>
              <div>
                <h3>{me?.name}</h3>
                <span>{me?.role}</span>
                <span>{me?.email}</span>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => void pickPhoto(event.target.files?.[0])}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    {photoBusy ? "Uploading…" : me?.avatar ? "Change photo" : "Upload photo"}
                  </button>
                  {me?.avatar && (
                    <button type="button" className="btn btn-sm btn-icon-danger" onClick={() => void removePhoto()} disabled={photoBusy}>
                      Remove
                    </button>
                  )}
                </div>
                {photoError && <div className="auth-error" role="alert" style={{ marginTop: 8 }}>{photoError}</div>}
              </div>
            </div>
            <form className="panel-body" onSubmit={saveProfile}>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <div className="set-row">
                <Tile hue="#5b8def">
                  <IconUser size={15} />
                </Tile>
                <label className="sr-copy" htmlFor="p-name">
                  <strong>Name</strong>
                </label>
                <input
                  id="p-name"
                  ref={nameRef}
                  className="set-input"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  required
                />
              </div>
              <div className="set-row">
                <Tile hue="#f06aa8">
                  <IconBell size={15} />
                </Tile>
                <label className="sr-copy" htmlFor="p-email">
                  <strong>Email</strong>
                </label>
                <input
                  id="p-email"
                  className="set-input"
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                  required
                />
              </div>
              <div className="set-row">
                <Tile hue="#2dd4bf">
                  <IconCheck size={15} />
                </Tile>
                <label className="sr-copy" htmlFor="p-role">
                  <strong>Role</strong>
                </label>
                <input
                  id="p-role"
                  className="set-input"
                  value={profile.role}
                  onChange={(event) => setProfile({ ...profile, role: event.target.value })}
                />
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save profile"}
                </button>
                <span className="dim" style={{ fontSize: 12 }}>
                  {me?.is_admin ? "Workspace admin" : "Workspace member"} · {workspace.workspace.name}
                </span>
              </div>
            </form>
          </section>
          )}

          {section === "notifications" && notifyCard}

          {section === "appearance" && (
          <section className="panel glass span">
            <h2>Appearance</h2>
            <p className="panel-desc">The whole app re-tints through its glass</p>
            <div className="panel-body">
              <div className="set-row">
                <Tile hue="#5b8def">
                  <IconSun size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Theme</strong>
                  <span>Auto follows your system</span>
                </div>
                <Seg>
                  {(["light", "dark", "auto"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={workspace.settings.theme === value}
                      onClick={() => void updateSettings({ theme: value })}
                    >
                      {value === "light" ? <IconSun size={13} /> : value === "dark" ? <IconMoon size={13} /> : null}
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </Seg>
              </div>

              <div className="set-block">
                <div className="set-row">
                  <Tile hue="#a78bfa">
                    <IconShapes size={15} />
                  </Tile>
                  <div className="sr-copy">
                    <strong>Wallpaper</strong>
                    <span>{WALLS.find((wall) => wall.id === workspace.settings.wall)?.label}</span>
                  </div>
                </div>
                <div className="swatches">
                  {WALLS.map((wall) => (
                    <button
                      key={wall.id}
                      className="swatch"
                      aria-pressed={workspace.settings.wall === wall.id}
                      aria-label={wall.label}
                      onClick={() => void updateSettings({ wall: wall.id })}
                    >
                      <span
                        className="swatch-art"
                        style={{
                          backgroundImage: `radial-gradient(60% 70% at 25% 20%, ${wall.blob}88, transparent 70%), linear-gradient(150deg, ${wall.a}, ${wall.b})`,
                        }}
                      >
                        <i className="swatch-side" />
                        <i className="swatch-card" />
                        <i className="swatch-chip" />
                        <span className="swatch-tick">
                          <IconCheck size={13} />
                        </span>
                      </span>
                      <span className="swatch-name">{wall.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="set-row">
                <Tile hue="#2dd4bf">
                  <IconGridGlass />
                </Tile>
                <div className="sr-copy">
                  <strong>Glass</strong>
                  <span>Tinted keeps the room private. Clear lets the light through.</span>
                </div>
                <Seg>
                  <button aria-pressed={workspace.settings.glass === "tinted"} onClick={() => void updateSettings({ glass: "tinted" })}>
                    Tinted
                  </button>
                  <button aria-pressed={workspace.settings.glass === "clear"} onClick={() => void updateSettings({ glass: "clear" })}>
                    Clear
                  </button>
                </Seg>
              </div>

              <div className="set-row">
                <Tile hue="#fb923c">
                  <IconAlert size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Reduce transparency</strong>
                  <span>Solid surfaces, no blur</span>
                </div>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={workspace.settings.solid}
                  aria-label="Reduce transparency"
                  onClick={() => void updateSettings({ solid: !workspace.settings.solid })}
                />
              </div>

              <div className="set-block">
                <div className="set-row">
                  <Tile hue="#f472b6">
                    <IconSun size={15} />
                  </Tile>
                  <div className="sr-copy">
                    <strong>Accent</strong>
                    <span>Used for focus, progress and the little glints</span>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 10 }}>
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent.id}
                      className="accent-dot"
                      aria-pressed={workspace.settings.accent === accent.id}
                      aria-label={accent.label}
                      title={accent.label}
                      style={{ background: accent.color }}
                      onClick={() => void updateSettings({ accent: accent.id })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
          )}

          {section === "focus" && (
          <section className="panel glass span">
            <h2>Focus</h2>
            <p className="panel-desc">Defaults for the timer island. You can still pick 15, 25 or 50 minutes on the fly.</p>
            <div className="panel-body">
              <div className="set-row">
                <Tile hue="#fb923c">
                  <IconTimer size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Session length</strong>
                  <span>How long a focus block runs by default</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <NumberSetting
                    id="set-focus-minutes"
                    label="Focus minutes"
                    value={workspace.settings.focus_minutes}
                    min={5}
                    max={180}
                    onCommit={(next) => void updateSettings({ focus_minutes: next })}
                  />
                  <span className="dim">min</span>
                </div>
              </div>
              <div className="set-row">
                <Tile hue="#2dd4bf">
                  <IconTimer size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Break length</strong>
                  <span>Suggested pause between sessions</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <NumberSetting
                    id="set-break-minutes"
                    label="Break minutes"
                    value={workspace.settings.break_minutes}
                    min={1}
                    max={60}
                    onCommit={(next) => void updateSettings({ break_minutes: next })}
                  />
                  <span className="dim">min</span>
                </div>
              </div>
              <div className="set-row">
                <Tile hue="#a78bfa">
                  <IconCheck size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Today so far</strong>
                  <span>
                    {workspace.focus.sessions} sessions · {workspace.focus.minutes} minutes
                  </span>
                </div>
                <span className="chip accent">
                  <IconCheck size={12} /> recorded
                </span>
              </div>
            </div>
          </section>
          )}

          {section === "data" && (
          <section className="panel glass span">
            <h2>Data</h2>
            <p className="panel-desc">Take your work with you, or start the demo over.</p>
            <div className="panel-body">
              <div className="set-row">
                <Tile hue="#2dd4bf">
                  <IconDownload size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Export tasks</strong>
                  <span>Every task in this workspace as a CSV, including due dates and completion</span>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    window.location.href = "/api/export.csv";
                  }}
                >
                  <IconDownload size={14} /> Download CSV
                </button>
              </div>
              {me?.is_admin && (
                <div className="set-row">
                  <Tile hue="#fb923c">
                    <IconRefresh size={15} />
                  </Tile>
                  <div className="sr-copy">
                    <strong>Reset sample data</strong>
                    <span>Restores the seeded projects, tasks, events and activity. Your account stays.</span>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!window.confirm("Reset the workspace sample data? This deletes current projects, tasks and events.")) return;
                      try {
                        await api.reset();
                        await refresh();
                        toast("Workspace reset to the sample data");
                      } catch (caught) {
                        toast(caught instanceof Error ? caught.message : "Could not reset", "error");
                      }
                    }}
                  >
                    <IconRefresh size={14} /> Reset
                  </button>
                </div>
              )}
              <div className="set-row">
                <Tile hue="#5b8def">
                  <IconLogOut size={15} />
                </Tile>
                <div className="sr-copy">
                  <strong>Sign out</strong>
                  <span>End this session on this device</span>
                </div>
                <button
                  className="btn"
                  onClick={() =>
                    void signOut().catch((caught) =>
                      toast(caught instanceof Error ? caught.message : "Could not sign out", "error"),
                    )
                  }
                >
                  <IconLogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          </section>
          )}

          <section className="panel glass span">
            <h2 className="row" style={{ gap: 8 }}>
              <IconAlert size={15} /> A note on this build
            </h2>
            <p className="panel-desc">
              Lucent stores everything in SQLite on your own server. Passwords are hashed with scrypt, sessions are HttpOnly cookies, and
              there is no third-party analytics. Export is the only way data leaves.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function IconGridGlass() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 10h18M9 10v10" />
    </svg>
  );
}
