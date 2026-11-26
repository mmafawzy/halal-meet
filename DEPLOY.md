# Deploying Halal Meet

Two deployables: the **API** (`apps/api`, a Docker image) and the **mobile app** (`apps/mobile`, built with EAS).
Every push and pull request runs CI (typecheck, tests, API build, Docker image build and a container smoke test).

## 1. API

### What it needs

| Need | Service (examples) | Env |
|---|---|---|
| Container host | Fly.io, Render, Railway, AWS ECS/App Runner, Google Cloud Run | see `apps/api/.env.example` |
| Postgres 14+ | Neon, Supabase, RDS, Cloud SQL | `DATABASE_URL` |
| Redis (only with 2+ instances) | Upstash, ElastiCache, Redis Cloud | `REDIS_URL` |
| Object storage (photos) | Cloudflare R2, S3, Backblaze B2 | `PHOTO_STORAGE=s3`, `S3_*` |
| Sign-in codes | Twilio Verify (SMS + WhatsApp) | `OTP_PROVIDER=twilio`, `TWILIO_*` |
| Push notifications | Expo push service | `EXPO_ACCESS_TOKEN` |
| Store billing | RevenueCat | `REVENUECAT_*` |

Minimum to boot in production: `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL`. Without `OTP_PROVIDER=twilio`
the API runs but sign-in returns `503 otp_unavailable` (the dev code `000000` is never accepted in production).

### Build and run

```bash
docker build -f apps/api/Dockerfile -t halal-meet-api .
docker run -p 3000:3000 -e NODE_ENV=production -e JWT_SECRET=… -e DATABASE_URL=… halal-meet-api
curl http://localhost:3000/health   # {"status":"ok","database":"ok","realtime":"local"}
```

- **Migrations** run automatically on start (Drizzle, from `apps/api/drizzle`). They are additive; run one instance
  first when deploying a release that adds migrations, then scale out.
- **Health check:** `GET /health` (public). The image also declares a Docker `HEALTHCHECK`.
- **Scaling:** stateless apart from realtime fan-out — set `REDIS_URL` before running more than one instance.
  The notification scheduler runs on every instance but a Postgres advisory lock lets only one run each pass.
- **Photos** are private objects; clients only ever fetch them through `GET /photos/:id`, which checks access and
  short-lived signed tokens. Set `PUBLIC_API_URL` to the public API origin when behind a proxy.
- **Account deletion purge:** run `node dist/purge-deletions.js` daily in the same image and environment (a cron job,
  scheduled task or one-off container) to erase accounts whose grace period has passed. Locally:
  `pnpm --filter @halal-meet/api purge:deletions`.

### Local production-like stack

`docker compose up --build` starts the API with Postgres, Redis and MinIO (S3-compatible, bucket created
automatically). Sign in with the dev code `000000`; MinIO's console is on http://localhost:9001.

Seed demo data against it with `DATABASE_URL=postgres://halalmeet:halalmeet@localhost:5432/halalmeet pnpm --filter @halal-meet/api seed`
(expose the Postgres port first — it is not published by default).

## 2. Mobile app (EAS)

One-time setup (needs your Expo account):

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas init                 # creates the EAS project and writes extra.eas.projectId into app.json (push needs it)
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.halalmeet.app --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility sensitive
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_… --visibility sensitive
```

Repeat the `env:create` lines for the `preview` and `development` environments (pointing at staging/local APIs).

| Profile | Use | Command |
|---|---|---|
| `development` | Dev client on the iOS simulator / Android emulator (native modules: push, RevenueCat) | `eas build -p ios --profile development` |
| `development-device` | Dev client on physical devices | `eas build --profile development-device` |
| `preview` | Internal testers (APK on Android, ad-hoc on iOS) | `eas build --profile preview` |
| `production` | Store builds (version auto-incremented) | `eas build --profile production` then `eas submit -p ios` / `-p android` |

Store side (owner only): App Store Connect and Google Play Console apps for bundle id `app.halalmeet.mobile`, the
in-app products listed in `packages/core/src/billing.ts`, and the RevenueCat project/webhook described in the
billing section of `apps/mobile/README.md`. Expo Go cannot load RevenueCat — use a development build.

## 3. Launch checklist

- [ ] Production Postgres, object storage bucket (private), Redis if >1 instance
- [ ] `JWT_SECRET` (long, random) and `PUBLIC_API_URL`
- [ ] Twilio Verify service with SMS (and WhatsApp sender if wanted), Fraud Guard on
- [ ] `EXPO_ACCESS_TOKEN` and `eas init` (projectId) for push
- [ ] RevenueCat project, store products, webhook secret
- [ ] Daily `purge:deletions` job
- [ ] Real Terms of Use and Privacy Policy text; verified emergency numbers (Safety screen)
- [ ] Moderator accounts (`accounts.role = 'moderator'`)
