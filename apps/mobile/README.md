# Halal Meet — mobile app (`@halal-meet/mobile`)

Expo (SDK 57) + Expo Router app for iOS, Android and the web (react-native-web).
English and Arabic, with full RTL and Arabic copy that changes with the viewer's gender.

> Halal Meet is a Muslim **marriage** platform. Keep the tone respectful, calm and modern.

## Quick start

```bash
# from the repo root (pnpm 10, Node 22)
pnpm install
pnpm --filter @halal-meet/mobile web        # browser (mock backend, no server needed)
pnpm --filter @halal-meet/mobile start      # Expo dev server (scan with Expo Go / dev build)
pnpm --filter @halal-meet/mobile ios        # or: android
```

Other scripts:

| Script | What it does |
|---|---|
| `typecheck` | `tsc --noEmit` (strict) |
| `test` | `vitest run` — mock API plan limits, Passport, risk detection, gendered `t()` |
| `export:web` | `expo export --platform web` (static SPA in `dist/`) |

## Mock vs live backend

The data layer is selected by env vars (Expo inlines `EXPO_PUBLIC_*` at build time; copy `.env.example` to `.env`):

| Variable | Default | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_MODE` | `mock` | `mock` = in-memory demo backend inside the app. `live` = HTTP calls to `apps/api`. |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | Base URL used in `live` mode. |

**Mock mode** (default) makes the whole app demoable with zero backend:

- Any 6-digit OTP works — use **`000000`**.
- ~170 seeded members are generated deterministically once you set your country and gender in onboarding (about half in your country, the rest spread over the core `COUNTRIES` for Passport). Each has Muslim names (Latin and Arabic), a city, a bio, verifications, Halal Mode, preferences and answers to the core `QUESTIONS` (respecting `selfFor`: only women answer hijab and only men answer beard; the other gender sets a preference).
- The feed, Top Picks and Passport counts use the real engine from `@halal-meet/core` (`checkEligibility`, `computeCompatibility`, `rankScore`), so dealbreakers, Halal Mode and international visibility are respected.
- `PLAN_LIMITS` are enforced. Free users get 10 interests a day (then a 402-style `LimitReachedError`, which opens the limit sheet), 1 Serious Interest a week, a truncated compatibility report, and a count only for incoming interests. Passport capacity follows `passportCapacity()`.
- About 30% of interests become mutual (100% if they already liked you). Two conversations and a few incoming interests (one Serious, with a note) are seeded so every tab has content.
- Replies arrive about 2.5 s after you write. Topic cards you send are answered by the other person and revealed once you answer. Every third message, they send you a topic card.
- Messages that mention money or moving off the platform (EN and AR keywords) get `risk` warnings, which show the inline safety banner.
- Purchases call `devGrant` (Plus, Gold, 7-day pass, add-on). "Verify now (demo)" simulates ID verification, which Passport and Serious Interest need.
- Guardians: invitations get real codes; accepting your own code answers `400 cannot_guard_self` (as the server does), so Family → guardian card → **Simulate acceptance (demo)** (`api.dev.simulateGuardianAccept`) marks them accepted and seeds one or two example opinions on your matches. The fictional member invitation **`DEMOWALI`** (`/guardian/DEMOWALI`) shows the guardian side: preview, accept, dashboard (3 introductions, one ready for the family introduction and waiting for your approval, one shared profile), Approve / "Discuss first", opinions and leaving.
- Guardian presence: `MatchSummary.guardians.mine` lists your accepted, active guardians; seeded members in Wali mode have a father who reads and takes part (`guardians.theirs`), and the first seeded conversation is with one of them. The chat header shows one line per guardian.
- Stage approvals: "I'm ready for stage 5/6" advances straight away, unless you have an accepted, active guardian with `approve_stages`. Then the stage holds with `pendingGuardianApproval.mine` until one of them approves; in the chat, **Simulate approval (demo)** (`api.dev.simulateGuardianApproval`) stands in for their phone. Seeded members' guardians never hold a stage.
- Sharing profiles: Profile → ⋯ → **Share with my guardian** calls `POST /guardians/shares`; once your guardian accepted, the Family tab's dashboard preview (built by `api.dev.guardianDashboardFor`) lists it under "Shared with you".
- State is snapshotted to AsyncStorage/localStorage, so a web reload keeps your demo. Profile → Demo tools → Reset clears it.

**Live mode** talks to `apps/api` using the contract in `packages/core/src/api.ts` (`ROUTES`):

- Bearer token from `POST /auth/otp/verify`, stored with `expo-secure-store` (localStorage on web).
- HTTP 402 `{ error: 'limit_reached', usage }` → `LimitReachedError` → limit sheet / paywall.
- 401 clears the token.
- List endpoints accept either a bare array or `{ matches | messages | answers | countries: [...] }`.
- Realtime: on the web the app opens `GET /events?token=` (Server-Sent Events, `NOTIFICATION_ROUTES`) and refreshes chat, matches and the inbox on `message` / `match` / `notification` events; while the stream is open the chat polls only every 15 s. On native, in mock mode or when the stream drops, the chat polls `GET /matches/:id/messages` every 2 s.
- Push: on iOS/Android the Expo push token is registered with `POST /me/devices` once permission is granted (needs an EAS `projectId` in `app.json` → `extra.eas`). Taps open `data.url`.

## Folder structure

```
apps/mobile
├── app.json, metro.config.js (pnpm monorepo + resolves @halal-meet/core from source), vitest.config.ts
└── src
    ├── app/                    Expo Router routes (typed routes)
    │   ├── _layout.tsx         providers, fonts, RTL sync, global LimitSheet + Toast
    │   ├── index.tsx           splash / auth + onboarding gate
    │   ├── (onboarding)/       language, welcome, phone, otp, intention, halal-mode, basics,
    │   │                       photo, religion, questions, dealbreakers, notifications, ready
    │   ├── (tabs)/             discover, matches, conversations, family, profile
    │   ├── profile/[id].tsx    full profile + Why we match + Ask Before You Match
    │   ├── match/[matchId].tsx match celebration
    │   ├── chat/[matchId].tsx  structured chat (stages, topic cards, safety)
    │   ├── passport/           hub + activation (purchase sheet)
    │   ├── paywall.tsx         contextual plan comparison (from PLAN_LIMITS)
    │   ├── guardian/           invite landing ([code]), guardian home (index), member dashboard (member/[memberId])
    │   └── settings/           edit, preferences, privacy, safety, questions library
    ├── api/
    │   ├── types.ts            HalalMeetApi interface (one method per core ROUTE / GUARDIAN_ROUTE) + errors
    │   ├── live.ts             fetch implementation
    │   ├── mock/               in-memory backend (seed.ts, content.ts, index.ts) + tests
    │   ├── hooks.ts            React Query hooks
    │   └── tokenStorage.ts
    ├── billing/                purchase adapter (dev grant now; RevenueCat TODO)
    ├── components/             ui/ (design system), profile/, questions/, discover/, interest/,
    │                           chat/, matches/, onboarding/, passport/, paywall/, me/, family/,
    │                           safety/, global/
    ├── i18n/                   i18next setup, gendered t() (translate.ts), RTL (rtl.ts), strings/*
    ├── lib/                    formatting, cities, compatibility rendering helpers
    ├── state/                  zustand stores (session, ui, local)
    └── theme/                  design tokens (spec 01 §0) + typography
```

## i18n and RTL

- Strings live per feature in `src/i18n/strings/<ns>.ts`. Each file has `en`, then `ar` with the same shape (type-checked), then `arGendered` with extra keys.
- `useT()` resolves `key_f` / `key_m` from the signed-in user's gender, then falls back to `key`. Before the gender is known it uses the masculine form.
- `useTs()` resolves `key_she` / `key_he` for strings that describe another person (for example «يقيم» / «تقيم»).
- Question and option text comes from core `pick(text, locale, gender)` via `usePick()`.
- Layout uses only logical properties (`marginStart`, `paddingEnd`, `start`/`end`). Directional icons use `<Icon directional />`, which mirrors them.
- Switching language calls `applyLocale()`. On native it runs `I18nManager.allowRTL/forceRTL` and reloads (`expo-updates` `reloadAsync`, falling back to `DevSettings.reload`). On the web it sets `<html dir lang>` and re-renders.
- Fonts: Inter for Latin, IBM Plex Sans Arabic for Arabic (one size step larger). The Latin "HALAL MEET" wordmark is used in both languages.

## What's real vs stubbed

| Area | Status |
|---|---|
| Onboarding, Discover feed (infinite, cursor + prefetch), Top Picks, profile, Why we match, Ask Before You Match, interests/limits, matches, chat (stages, topic cards, safety banners, end respectfully), Passport, paywall | Implemented against the API contract. Fully working in mock mode. |
| Purchases | `src/billing` adapter: RevenueCat (`react-native-purchases`, live mode on iOS/Android dev/release builds when `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` or `expo.extra.billing` keys are set; not in Expo Go/web), dev grant (`POST /billing/dev/grant`) in mock mode and live dev builds, and a "buy in the mobile app" notice on live release web. Server truth comes from the RevenueCat webhook (`BILLING_ROUTES` in `packages/core/src/billing.ts`); the paywall shows `GET /me/billing` (renewal date, store, billing issues, Manage subscription). |
| Photo upload | Picker + visibility preview only. The contract has no upload route, so the photo stays on the device. |
| Family / guardians | Implemented against `GUARDIAN_ROUTES` (`packages/core/src/guardians.ts`): invite with the real one-time code (link `https://halalmeet.app/g/<code>`), re-send (re-issues the code), permissions, pause/resume, remove, and guardians' opinions on your matches and on profiles you share (`POST`/`DELETE /guardians/shares`; shared ids are remembered on the device because there is no GET). Guardian presence in chats comes from `MatchSummary.guardians`, and stages 5/6 wait for an approving guardian (`pendingGuardianApproval`, calm banner in the chat and journey sheet). Guardian side: `/guardian/<code>` (public preview with gendered Arabic from `memberGender` → phone/OTP only, no member onboarding → accept), `/guardian` (people you support), `/guardian/member/<id>` (dashboard, Approve / "Discuss first" via `PUT …/approvals/:matchId`, "Shared with you", opinions, leave). In mock mode "Simulate acceptance (demo)" stands in for the guardian's phone, and the demo invitation `DEMOWALI` lets you try the guardian side on one device. |
| Saved profiles ("Save for later") | Stored on the device (no API route). |
| Match preferences | `PUT /me/preferences` works. The last saved value is cached locally because the contract has no GET. |
| Notifications | Inbox (`/notifications`, bell in the Discover header), settings (`/notifications/settings`, Profile → Settings → Notifications), permission at the onboarding notifications step, prefs saved with `PUT /me/notification-prefs`, push tap routing. Mock mode adds inbox items for seeded interests, replies, matches and guardian events (no real pushes). |
| Voice intro, video calls, AI features, Hijri dates, Eastern numerals | Not implemented (copy and placeholders only). |
| Realtime chat | SSE (`GET /events`) on the web in live mode, 2 s polling otherwise. |
| Identity verification | Mock-only "Verify now (demo)". The vendor SDK is out of scope. |
