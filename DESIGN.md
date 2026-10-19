# Lucent design direction

Direction is the reference the product was built against: a calm, tactile glass workspace.
Every rule below exists so future changes keep that identity instead of drifting into a generic app shell.

## Design read

Reading this as: a team workspace for small product studios, in a soft glass material language,
dial ENERGY 2 / RHYTHM 2 / MOTION 2.

- **ENERGY 2**: the interface greets you with one large greeting and three quiet stat cards. It is warm, not loud.
- **RHYTHM 2**: the home grid mixes a ring card, an agenda, a focus card and three wide cards. Sections differ, but the page keeps one shared gutter and card radius.
- **MOTION 2**: hover lifts, a pointer glint, the island's clip-path reveal, and a 42s wallpaper drift. Motion explains state; it never performs.

## Identity

- **Material, not decoration.** Glass is the product's character: a translucent fill, a conic rim, a top sheen, and a pointer-following glint. It appears on chrome and content because the wallpaper behind it is part of the identity, not a backdrop picked for looks.
- **Wallpapers carry the mood.** Eight named wallpapers (ash, smoke, dusk, aurora, bloom, ember, grove, tide) let a workspace change temperature without changing the interface.
- **Typography is native.** The display and text stack starts with the platform UI font, so the app reads as part of the OS rather than a web page wearing a typeface.
- **Color is restrained.** Two neutrals, one accent, and semantic status colors. Series colors (rings, chart lines, column dots) derive from tokens rather than a separate rainbow.

## Deliberate overrides

- **Glass on many surfaces.** The anti-slop dose cap asks for blur on at most one or two surfaces. This product inverts that on purpose: the material system is the brand, and Settings offers "Reduce transparency" for anyone who wants flat panels. The override is recorded here so it stays a decision rather than an accident.
- **Elevation everywhere.** Depth shadow is part of the glass metaphor (a pane sitting above a wallpaper), so it is applied as material rather than as an elevation hierarchy.
- **No marketing surfaces.** There are no testimonials, no pricing tiers, no logo bars, and no invented statistics. Presence and capacity on the Team page are labeled sample data until live sessions ship.

## Rules for changes

- New color goes into `tokens.css` as a variable, never as a literal in a page stylesheet.
- A new surface either uses the glass material or the flat `--fill` tint. Do not invent a third treatment.
- Copy uses plain punctuation. No em dashes, no buzzwords.
- Every interactive element must do something. If it cannot yet, it does not ship.
