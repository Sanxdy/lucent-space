# Demo video

A 45-second narrated tour of Lucent, rendered from HTML with
[HyperFrames](https://hyperframes.dev). The captures are of a running instance, not
mockups: `01-login.webp` through `08-admin-edit.webp` were taken from a demo instance
seeded with invented people, teams and projects — no real workspace data.

## Sound

- **Voiceover:** one clip per scene in `audio/`, generated once with `espeak-ng` on the
  mbrola US voice (the default espeak voice is too robotic for a product film) and
  converted to AAC. Scene lengths are derived from these clips, so a line is never cut.
- **Music:** `audio/bgm.mp3`, a CC0 track. It sits under the narration and ducks to 22%
  whenever a line is spoken, returning to 55% in the gaps.
- **Rebuilding a line:** change the sentence in the `make_vo.sh` script, regenerate the
  clips, then re-render. The scene `data-duration` values follow the audio automatically.

## Rebuild after a UI change

Capture the screenshots again (any browser, 1440x900, saved under the same names), then:

```bash
cd docs/demo
npx hyperframes check                 # 0 errors, and 20/20 contrast checks
npx hyperframes snapshot --at 6,12,20 # eyeball a few frames
npx hyperframes render -o lucent-demo.mp4
```

Rendering takes about four and a half minutes on a machine without a GPU, because it
falls back to screenshot capture on software GL.

## Composition notes

- `index.html` is one standalone composition: eight scenes, one paused GSAP timeline
  registered as `window.__timelines["lucent-demo"]`, 1920x1080 at 30fps for 45.5s.
- Each scene fades its own contents; clip visibility belongs to the framework, so nothing
  tweens `display` or `visibility` on a `.clip`.
- The app frames are 1400px wide, which puts a 1600x1000 capture at 913px tall inside the
  1080px canvas and leaves room for the caption underneath.
- `.scene` is `position: absolute; inset: 0` so a scene is the containing block for its
  absolutely positioned caption. Without that the caption resolves against the document
  and lands off-screen.
- Audio lives in `<audio>` elements clipped to the timeline, with a `volume` automation
  lane that produces the ducking.

## Checking the output

Vision reads a rendered frame poorly — it called a correct frame "cut off" and a broken
one "fine". Measure instead:

- **Captions:** scan the bottom of a frame row by row for bright pixels. A caption ends
  ~52px above the frame edge; anything that reaches the last row is either clipped or the
  progress bar, which sits flush by design.
- **Voiceover present:** convert the audio to mono and compute RMS in 0.2s windows. Speech
  shows as bursts starting at each scene start, well above the music floor.
- **No real data:** OCR every frame and fail on any name, email or team from the real
  workspace. The demo instance's own data is invented, so a clean scan is meaningful.
