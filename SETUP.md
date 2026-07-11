# LiDAR Distance — Getting it onto your iPhone

Everything in this repo is written and typechecked, but iOS apps can only be
**compiled on a Mac**, so the build happens in the cloud. You develop on
Windows; the phone runs the result. One-time setup below, then day-to-day
iteration is instant.

## How the pieces fit

- `modules/lidar-measure/ios/*.swift` — the native ARKit/TrueDepth code.
  Changing it requires a new cloud build (~15–25 min). It is designed so you
  should rarely need to touch it.
- Everything else (`App.tsx`, `src/**`) — TypeScript. Changes hot-reload to
  the phone over Wi-Fi in seconds, no build.

## One-time setup (do these in order)

### 1. Create an Expo account (free)

Sign up at https://expo.dev, then in a terminal in this folder:

```
npm i -g eas-cli
eas login
eas init          # creates the EAS project, links this repo
eas update:configure   # writes the updates URL into app.config.ts
```

### 2. Choose a distribution path

**Path A — Apple Developer account, $99/yr (recommended, much smoother):**

```
eas device:create      # opens a QR code — scan with the iPhone to register its UDID
eas build -p ios --profile development
```

The first build walks you through signing in with your Apple ID; EAS creates
and stores all certificates in the cloud (no Mac, no Keychain). When the
build finishes, open the build page link on the iPhone in Safari and tap
Install.

**Path B — free Apple ID (works, but the app expires every 7 days):**

1. Push this repo to GitHub and run the **"iOS unsigned IPA"** workflow
   (Actions tab → choose `Debug` for the dev client, `Release` for a
   standalone build).
2. Download the IPA artifact to your PC.
3. Install [Sideloadly](https://sideloadly.io), connect the iPhone by USB,
   drag the IPA in, sign with your Apple ID.
4. On the iPhone: Settings → General → VPN & Device Management → trust your
   developer certificate.
5. Every 7 days: re-run Sideloadly with the same IPA (no rebuild needed).

### 3. Start developing

```
npm start
```

Open the installed dev-client app on the iPhone — it finds the dev server on
your Wi-Fi (allow Node through the Windows Firewall if prompted; the phone
and PC must be on the same network). Edit any TypeScript file and the app
updates live.

### 4. Ship updates without rebuilding

```
eas update --channel development --message "describe the change"
```

JS-only changes reach installed builds over the air. If you change Swift
code, bump `version` in `app.config.ts` and do a new cloud build.

## Using the app

- **Crosshair mode** — live distance to whatever the center reticle points at.
- **Tap mode** — tap an object to pin a marker; the top readout tracks the
  distance to it as you move. "Clear" removes markers.
- **Front mode** — TrueDepth distance to the frame center (works ~0.2–1.2 m).
- Tap the distance readout **3× fast** to toggle the debug overlay (tracking
  state, raw vs smoothed values, raycast method, event rate, last error) —
  this is the main diagnostics tool since there's no Xcode console.
- Green/yellow/red dot next to the reading = measurement confidence.

## Accuracy check (recommended after first install)

Put the phone at tape-measured 0.5 / 1 / 2 / 5 m from a wall in crosshair
mode. Expect within ~1–2 cm up to 2 m and ~1% at 5 m. If the readout feels
laggy or jittery, tune `updateHz` / `smoothing` in
`src/screens/MeasureScreen.tsx` — those are live-reloadable props.
