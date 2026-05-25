# React Native migration — Phase 8 (M8, distribution: EAS Build + TestFlight / Play internal + shared-secret auth)

## Context

M1–M7 turned the single Next.js web app into a pnpm monorepo (`@splitbill/core` + `apps/web` + `apps/mobile`), built the full Expo SDK 56 mobile app (capture → extract → swipe-assign → prorated totals → inline edit → AsyncStorage persistence), and polished chrome + accessibility (designed icon/splash, VoiceOver/TalkBack row actions, section animations, safe areas). The app runs in Expo Go / a dev client and the simulator, and `expo export` compiles a clean Hermes/web bundle. **Everything works locally; nothing is distributable yet.**

M8 is the **distribution** milestone. It does three things:

1. **Lock down the backend.** `/api/extract` (`apps/web/src/app/api/extract/route.ts`) is still **unauthenticated** — it was first-party-browser-only, but a shipped mobile binary calling it over the public internet invites abuse of our Anthropic credits. M8 adds a shared-secret header (the M4-flagged follow-up) before any external binary ships.
2. **Stand up EAS Build + submit pipelines.** No `eas.json` exists yet. M8 adds build profiles, wires managed credentials, and produces installable artifacts for both platforms.
3. **Get the app onto testers' devices.** TestFlight internal group (iOS) + Play Console internal testing track (Android), then a real-device smoke matrix against the production API.

Scope decisions (confirm before executing where noted):
- **No public store release in M8.** Internal/closed testing only — TestFlight internal + Play internal track. Public App Store / open-testing submission is a later milestone once testers sign off.
- **Managed credentials.** Let EAS generate and store signing credentials (iOS distribution cert + provisioning profile, Android keystore) rather than hand-managing them. Lower friction; EAS is the source of truth.
- **Shared-secret, not full auth.** A single rotating secret in a header is enough to stop drive-by abuse of the unauthenticated endpoint. Per-user auth / rate limiting / App Attest is explicitly out of scope (noted as a follow-up).

> **Prerequisites that need a human (cannot be done from this environment):** an Apple Developer paid membership ($99/yr) + an App Store Connect app record, a Google Play Console account ($25 one-time) + an app record, and an Expo (EAS) account. The sandbox also can't run `eas build` (it needs EAS's cloud builders and interactive logins, and the network policy blocks everything but `api.anthropic.com` + the git remote). M8 work that this environment *can* do: write `eas.json`, the auth code on both sides, the version/config wiring, tests, and docs. The actual `eas build` / `eas submit` / device install steps are run by a maintainer on a networked machine — this plan spells them out precisely.

## Survey findings (current state, verified)

- **`route.ts` has no auth gate.** It checks `ANTHROPIC_API_KEY`, validates the `image` part (MIME allow-list + 8 MB cap), calls `extractReceipt`, and returns JSON. No header/origin check. `route.test.ts` covers 200/400/413/415/500/502 by mocking `@splitbill/core/server`.
- **Mobile posts plain multipart.** `apps/mobile/src/lib/extractFromPicker.ts:86` does `fetch(\`${apiBaseUrl()}/api/extract\`, { method: "POST", body: form })` with no custom headers. `apiBaseUrl()` reads `Constants.expoConfig?.extra?.apiBaseUrl` (set in `app.config.ts` from `EXPO_PUBLIC_API_BASE_URL`, default the Vercel URL).
- **No `eas.json`.** EAS Build is not configured. `expo-dev-client` is not installed (only needed if we want dev builds; preview/production internal-distribution builds don't require it).
- **Versioning is static.** `app.config.ts` has `version: "0.1.0"` but no `ios.buildNumber`, `android.versionCode`, or `runtimeVersion`. EAS needs a build-number strategy (remote `appVersionSource` or `autoIncrement`).
- **CI is web-only.** `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile && pnpm lint && pnpm test` and a Vercel preview from `apps/web`. It does not build the mobile app — fine; EAS builds are triggered out-of-band (or via an EAS GitHub integration, optional).
- **Bundle identifiers are set.** `ios.bundleIdentifier` and `android.package` are both `com.splitbill.app` — ready for the store records.
- **Env on Vercel.** `ANTHROPIC_API_KEY` is already set (the web app uses it). M8 adds one more server var (`API_SHARED_SECRET`).

## Decisions baked in

- **Auth = constant-time compare of an `x-splitbill-key` header against `process.env.API_SHARED_SECRET`.** If the env var is unset, the route stays open (preserves local dev + the existing web browser flow, which doesn't send the header) — the gate only *activates* once the secret is configured server-side, and once active, the web client must send it too. **Decision point:** the web app is a public SPA, so any secret it ships is discoverable in the browser. Two viable postures (pick one in M8.1):
  - **(a) Header required for everyone, secret injected at build into web too.** Stops casual `curl` abuse but the web secret is extractable from the bundle — modest protection, simplest. 
  - **(b) Header required only for non-browser callers, web allowed via same-origin/Origin check.** The route allows requests whose `Origin`/`Referer` matches the deploy domain (browser, same-origin) OR that carry a valid `x-splitbill-key` (mobile). Better protection for the web path, slightly more logic.
  - Recommended: **(b)** — it doesn't leak a secret into the public web bundle and still gates the mobile binary. The web `fetch` stays header-less and is admitted by origin; mobile sends the secret.
- **Secret delivery to mobile = `EXPO_PUBLIC_API_SECRET`, surfaced via `app.config.ts` `extra.apiSecret`, read by `apiBaseUrl.ts`'s sibling.** Yes, an installed binary can be reverse-engineered to recover the secret — acceptable for "stop drive-by abuse," and the secret is rotatable server-side. Documented as a known limitation; App Attest / Play Integrity is the real fix and is deferred.
- **EAS managed credentials**, `appVersionSource: "remote"` with `autoIncrement` on the build profiles so build numbers/versionCodes bump automatically per build (no manual `app.config.ts` churn).
- **Two build profiles to start:** `preview` (internal distribution — ad-hoc/`.ipa` + `.apk` installable without the stores, for quick device smoke) and `production` (store-credentialed `.ipa` / `.aab` for TestFlight + Play internal). A `development` profile (dev client) is optional and only added if we want hot-reload on device.
- **`runtimeVersion: { policy: "appVersion" }`** so OTA-update compatibility tracks the app version — even though we're not shipping EAS Update in M8, setting the policy now avoids a later migration.
- **No web changes beyond the auth gate.** The framer-motion flow, the route's validation, and all tests stay; we only prepend the gate.
- **Tests stay offline.** The auth gate is unit-tested by extending `route.test.ts` (set/unset `API_SHARED_SECRET` via `vi.stubEnv`, assert 401 on missing/wrong header, 200 on correct header / allowed origin). No live API, no EAS in CI.

## M8 — Distribution

### Step M8.1 — Shared-secret gate on `/api/extract`

`apps/web/src/app/api/extract/route.ts` — add an authorization check at the very top of `POST`, before reading `formData()`:

```ts
function isAuthorized(req: Request): boolean {
  const secret = process.env.API_SHARED_SECRET;
  if (!secret) return true; // gate disabled until configured (local dev / current web)
  // (b) same-origin browser calls are allowed without the secret…
  const origin = req.headers.get("origin") ?? "";
  const allowed = process.env.NEXT_PUBLIC_SITE_ORIGIN; // e.g. https://vibe-splitthebill.vercel.app
  if (allowed && origin === allowed) return true;
  // …everyone else (mobile, curl) must present the shared secret.
  const got = req.headers.get("x-splitbill-key") ?? "";
  return got.length === secret.length && timingSafeEqualStr(got, secret);
}
```

- Use a constant-time comparison (`crypto.timingSafeEqual` on equal-length buffers; bail early on length mismatch). Add a tiny `timingSafeEqualStr` helper in the route file or `@splitbill/core/server` (server-only — it imports `node:crypto`).
- On failure: `return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`.
- **CORS:** if the mobile origin ever triggers a preflight (it won't for a simple multipart POST without custom non-safelisted headers — but `x-splitbill-key` *is* non-safelisted, so RN may still skip preflight since RN fetch ignores CORS; browsers won't send this header). Add an `OPTIONS` handler returning the allow-list only if a browser ever needs it. Document that RN fetch bypasses CORS.

`apps/mobile/src/lib/extractFromPicker.ts` — add the header to the existing `fetch`:

```ts
const secret = apiSecret(); // new sibling of apiBaseUrl(), reads extra.apiSecret
res = await fetch(`${apiBaseUrl()}/api/extract`, {
  method: "POST",
  body: form,
  headers: secret ? { "x-splitbill-key": secret } : undefined,
});
```

`apps/mobile/app.config.ts` — add `extra.apiSecret: process.env.EXPO_PUBLIC_API_SECRET`. New `apps/mobile/src/lib/apiSecret.ts` mirrors `apiBaseUrl.ts` (reads `Constants.expoConfig?.extra?.apiSecret`, returns `string | undefined`).

**Server config (maintainer, one-time):** set `API_SHARED_SECRET` (and `NEXT_PUBLIC_SITE_ORIGIN` if posture (b)) in the Vercel project env for Production + Preview. Generate the secret with `openssl rand -hex 32`.

### Step M8.2 — Tests for the gate

`apps/web/src/app/api/extract/route.test.ts` — add a block (using the existing `vi.stubEnv` pattern in `beforeEach`):
1. **No `API_SHARED_SECRET`** → request without header still 200 (gate disabled; back-comp).
2. **Secret set, no header, no matching origin** → 401.
3. **Secret set, wrong header** → 401.
4. **Secret set, correct `x-splitbill-key`** → 200 (mocked `extractReceipt`).
5. **(posture b) Secret set, matching `Origin` header, no key** → 200.
6. Assert the 401 path never calls the mocked `extractReceipt` (no Anthropic spend on rejected calls).

`apps/mobile/src/lib/extractFromPicker.test.ts` — extend the existing fetch-mock test: when `extra.apiSecret` is set, assert the `fetch` call included `headers["x-splitbill-key"]`; when unset, assert no header. (Stub `Constants.expoConfig.extra` the way the suite already stubs `apiBaseUrl`.)

### Step M8.3 — `eas.json` + EAS project link

`pnpm --filter @splitbill/mobile add -D eas-cli` (or use `npx eas-cli`). Then `eas init` (maintainer; creates the EAS project + writes `extra.eas.projectId` into `app.config.ts`).

`apps/mobile/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "channel": "preview",
      "distribution": "internal",
      "ios": { "simulator": false },
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_API_BASE_URL": "https://vibe-splitthebill.vercel.app" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_API_BASE_URL": "https://vibe-splitthebill.vercel.app" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "<maintainer>", "ascAppId": "<from App Store Connect>", "appleTeamId": "<team>" },
      "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "internal" }
    }
  }
}
```

- `EXPO_PUBLIC_API_SECRET` is **not** committed to `eas.json` — set it as an **EAS secret** (`eas secret:create --name EXPO_PUBLIC_API_SECRET --value <secret> --scope project`) so it's injected at build without living in git.
- `app.config.ts`: add `runtimeVersion: { policy: "appVersion" }`, and (once `eas init` runs) the generated `extra.eas.projectId` + `updates.url`.
- `.gitignore`: add `apps/mobile/play-service-account.json` and any `*.p8`/`*.mobileprovision` so credentials never get committed.

### Step M8.4 — iOS build + TestFlight (maintainer, networked)

```bash
cd apps/mobile
eas build --platform ios --profile production      # EAS provisions dist cert + profile (managed)
eas submit --platform ios --profile production     # uploads the .ipa to App Store Connect
```

- In App Store Connect → TestFlight: add the build to an **internal testing** group (up to 100 testers, no Beta App Review needed for internal). Fill the export-compliance prompt (the app uses only standard HTTPS → typically "no" to custom crypto; confirm with the maintainer).
- iOS `infoPlist` usage strings (camera, photo library) already set in `app.config.ts` — required or the build is rejected.

### Step M8.5 — Android build + Play internal track (maintainer, networked)

```bash
eas build --platform android --profile production  # EAS generates + stores the upload keystore
eas submit --platform android --profile production # uploads the .aab to the internal track
```

- In Play Console: create the app record (package `com.splitbill.app`), complete the minimum store-listing + content-rating + data-safety form (the app sends receipt images to our server for processing → declare it), then promote the build to the **Internal testing** track and add testers by email.
- The Android adaptive icon (fg/bg/monochrome) + splash wired in M7 are exercised by the EAS prebuild here — first real cross-check of those assets.

### Step M8.6 — Quick-install preview builds (optional, for fast device smoke before store review)

```bash
eas build --platform all --profile preview         # internal-distribution .ipa (ad-hoc) + .apk
```

EAS returns install URLs/QR codes. iOS ad-hoc requires the test devices' UDIDs registered (`eas device:create`); Android `.apk` installs directly. Use these for the M8.7 smoke matrix without waiting on TestFlight/Play processing.

### Step M8.7 — Real-device smoke matrix

Against the **production** API (so the shared-secret path is exercised end-to-end):

1. **iPhone (notched / Dynamic Island)** — install via TestFlight; capture a receipt → extract → swipe-assign → totals → inline edit → kill & relaunch (AsyncStorage survives) → "New bill". Verify icon on home screen, splash on cold start, VoiceOver row actions, safe areas.
2. **Android (gesture-nav)** — install via Play internal; same flow. Verify adaptive icon (+ themed/monochrome on Android 13+), TalkBack actions, gesture-nav safe area on the footer.
3. **One older/smaller device** — verify layout + that the Hermes bundle runs.
4. **Auth** — confirm a `curl` to `/api/extract` without the header gets 401; the app (with the secret) gets 200; the web app still works (origin-allowed).
5. **Offline** — airplane mode → friendly "Network request failed" error, no crash.

### Step M8.8 — Docs

- `doc/mobile.md` §11: document `eas.json` profiles, `EXPO_PUBLIC_API_SECRET` as an EAS secret, `runtimeVersion` policy, and the credential-management posture (managed).
- `doc/mobile.md` §12: flip **M8 → ✅ shipped (internal)**; note public release is a follow-up.
- `doc/mobile.md` §13: resolve the "Backend exposure" bullet (shipped: shared-secret gate); add the residual limitation (web bundle / extractable mobile secret → App Attest/Play Integrity is the real fix, deferred).
- New `doc/distribution.md` (or a section): the maintainer runbook — Apple/Google/EAS account setup, the exact `eas build`/`submit` commands, how to rotate `API_SHARED_SECRET`, how to add testers.
- `AGENTS.md`: add the `EXPO_PUBLIC_API_SECRET` / `API_SHARED_SECRET` env vars to the testing/config notes.

### Step M8.9 — Verify

| Check | Command | Proves |
|---|---|---|
| Auth gate unit-tested | `pnpm --filter web test` | 401 on missing/wrong key; 200 on correct key / allowed origin; rejected calls don't hit Anthropic. |
| Mobile sends header | `pnpm --filter @splitbill/mobile test extractFromPicker` | `x-splitbill-key` attached when the secret is configured. |
| Core + web unchanged | `pnpm -r test && pnpm --filter web build` | No regression in the existing flow. |
| Config resolves | `cd apps/mobile && npx expo config --type prebuild` | `eas.projectId`, `runtimeVersion`, `extra.apiSecret` evaluate. |
| iOS artifact | `eas build -p ios --profile production` (maintainer) | A signed `.ipa` is produced and uploadable. |
| Android artifact | `eas build -p android --profile production` (maintainer) | A signed `.aab` is produced and uploadable. |
| End-to-end on device | M8.7 matrix | Real capture→extract→assign→persist against the gated production API. |

## Critical files modified or created

- `apps/web/src/app/api/extract/route.ts` (auth gate + optional `OPTIONS`)
- `apps/web/src/app/api/extract/route.test.ts` (gate cases)
- `packages/core/src/server/` (optional `timingSafeEqualStr` helper — server-only)
- `apps/mobile/src/lib/apiSecret.ts` (new), `apps/mobile/src/lib/extractFromPicker.ts` (send header), `extractFromPicker.test.ts` (assert header)
- `apps/mobile/app.config.ts` (`extra.apiSecret`, `runtimeVersion`, EAS `projectId`/`updates`)
- `apps/mobile/eas.json` (new), `apps/mobile/package.json` (eas-cli devDep)
- `.gitignore` (credential files)
- `doc/mobile.md` (§11/§12/§13), `doc/distribution.md` (new), `AGENTS.md`

**Reused as-is:** the entire app (M1–M7) ships unchanged behind the gate; `extractReceipt`, the validation in `route.ts`, the swipe/edit/persistence flows.

## Risks and open questions

- **Human-gated prerequisites.** Apple membership, Play Console, and an EAS account are required and cost money / need real identities — a maintainer must do account setup, device registration, store listings, and the actual `eas build`/`submit`. This environment can't (network policy + interactive logins). Everything else (code, config, tests, docs) is doable here.
- **Web secret extractability.** Posture (b) avoids shipping a secret in the public web bundle; posture (a) doesn't. Decide in M8.1. Neither stops a determined attacker who decompiles the mobile binary — that's the App Attest / Play Integrity follow-up (out of scope, documented).
- **`appVersionSource: "remote"` + autoIncrement** means EAS owns the build numbers; don't also hand-edit `buildNumber`/`versionCode` or they'll fight. If a maintainer prefers local control, switch to `"local"` and bump in `app.config.ts`.
- **iOS export compliance + data-safety / privacy nutrition labels.** Both stores require declaring that receipt images are sent off-device for processing. Get the wording reviewed; misdeclaring risks rejection.
- **EAS build minutes.** The free tier has limited concurrent/monthly builds; a paid EAS plan may be needed if iteration is heavy. Flag before a build storm.
- **OTA updates not in scope.** `runtimeVersion` policy is set so EAS Update can be added later without a config migration, but no `eas update` channel is wired in M8.
- **Secret rotation.** Rotating `API_SHARED_SECRET` invalidates already-installed mobile builds (they carry the old secret) until a new build ships. Document the rotation/rollout order (deploy server accepting both old+new briefly, or ship the new build first).
