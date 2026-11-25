# 05 — Architecture, AI, Trust & Safety, Privacy, Admin

← [Back to index](README.md)

## 1. Technical architecture

### 1.1 Stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native (Expo)** + TypeScript, Expo Router, React Query, Zustand | One codebase for iOS/Android, mature RTL (`I18nManager`), OTA updates |
| Guardian web | **Next.js** (shares the design system & API client) | Guardians can join from a link without installing the app |
| Admin console | Next.js + RBAC | Internal |
| API | **NestJS (Node/TypeScript)** modular monolith → split hot paths later | Fast to build, typed end-to-end |
| Matching service | **Python** (FastAPI) workers: scoring, feed candidate queues, Top Picks, ML | Data/ML ecosystem |
| Database | **PostgreSQL 16 + PostGIS**, read replicas | Relational integrity, geo |
| Cache / queues | **Redis** (cache, rate limits, counters) + **BullMQ** / SQS for jobs | |
| Realtime chat | WebSocket gateway (Socket.IO or a managed option such as Stream/Ably) | Typing, delivery, presence |
| Media | S3-compatible object storage + CDN, signed URLs, server-side blur variants | Photo privacy |
| Video | **LiveKit** (self-host or cloud) or Agora; SFU with multi-party family rooms | Low latency in MENA |
| Push | FCM + APNs via Expo Notifications; WhatsApp Business API for OTP/guardian digests | |
| Search/analytics | ClickHouse or BigQuery for events; PostHog / Amplitude for product analytics | |
| Feature flags & experiments | GrowthBook / LaunchDarkly | Pricing tests, algorithm A/B |
| Payments | **RevenueCat** (App Store / Google Play subscriptions) + **Stripe** (web: events, concierge, international) + **Paymob / Fawry** (Egypt: cards, wallets, cash-reference) | See §6 |
| Identity verification | Sumsub / Veriff / Onfido (choose by MENA document coverage & price) | ID + liveness |
| Moderation | Image moderation API + in-house text classifiers + LLM review queue | |
| Infra | AWS (me-central-1 UAE / me-south-1 Bahrain, eu-central-1, us-east-1), Terraform, EKS or ECS | Data residency |
| Observability | OpenTelemetry, Grafana/Datadog, Sentry | |

### 1.2 Service map

```
            ┌───────────── Mobile (RN) ─────────────┐   ┌── Guardian Web ──┐
            └──────────────┬────────────────────────┘   └────────┬─────────┘
                           │ HTTPS / WSS                          │
                    ┌──────▼──────────────── API Gateway / WAF ───▼────────┐
                    │  Auth · Profiles · Questions · Discover · Matches    │
                    │  Conversations · Family · Meetings · Verification    │
                    │  Billing/Entitlements · Notifications · Events · CMS │
                    └──┬──────────┬───────────┬────────────┬──────────────┘
                       │          │           │            │
                 PostgreSQL     Redis      Job queue    Object storage/CDN
                       │                      │
         ┌─────────────▼───────┐   ┌──────────▼───────────┐   ┌────────────────┐
         │ Matching (Python)   │   │ Trust & Safety       │   │ AI Gateway      │
         │ scoring, feed, ML   │   │ risk engine, mod Q   │   │ LLM, guardrails │
         └─────────────────────┘   └──────────────────────┘   └────────────────┘
                       │
                Analytics warehouse ← event stream (pseudonymised)
```

### 1.3 Data residency (all regions live at global launch)
- Accounts are pinned to a region shard (`accounts.region`): **MENA** (UAE/Bahrain region, with Egypt/KSA-specific handling per local law), **EU/UK** (Frankfurt), **US**.
- Cross-region matching (Passport) works on a **global matching index** containing only non-sensitive, pseudonymised matching features; full profiles are fetched on demand under transfer safeguards (SCCs / local-law equivalents). Legal review required per launch country (KSA PDPL and Egypt PDPL have specific cross-border rules).

### 1.4 Non-functional requirements
| NFR | Target |
|---|---|
| API p95 latency | < 250 ms (MENA) |
| Message delivery p95 | < 500 ms |
| Feed page p95 (20 cards incl. explanations) | < 300 ms; next page prefetched while scrolling |
| Top Picks ready by refresh time | 99.9% |
| Uptime | 99.9% |
| App cold start | < 2.5 s mid-range Android |
| Low-bandwidth mode | Compressed images, lazy media, works on 3G |
| Accessibility | WCAG 2.2 AA, dynamic type, screen readers in AR and EN |

---

## 2. AI features & guardrails

All LLM calls go through an internal **AI Gateway**: prompt templates, PII redaction, policy filters, logging (without storing raw content beyond 30 days), cost controls, and per-feature kill switches. Choose a frontier LLM provider with strong Arabic quality and a zero-data-retention/no-training agreement.

| Feature | Release | Input | Output | Guardrails |
|---|---|---|---|---|
| Bio assistant | V1 | User draft / prompt answers | 2–3 bio versions (AR/EN) | User approval required; strips contact info, flirtatious/explicit content, money mentions |
| Compatibility explanation | V2 | **Structured reason codes only** | Natural-language summary | Cannot add facts not in the codes; no religious judgments; templated fallback |
| "How differences could work" | V2 (Gold) | Discuss flags + both users' notes (consented) | Balanced perspectives + questions | Neutral tone; never says who's "right"; no fatwas; reviewed by the Advisory Board |
| Conversation assistant | V2 | Uncovered topics, last N messages (on-device or redacted) | Suggested question | Never auto-sends; opt-in; no impersonation |
| Coach mode | V2 (Gold) | User's own messages | Private tips | Visible only to the user |
| AI Matchmaker chat | V2 (Gold) | Natural-language request | Filter + ranked shortlist + reasoning | Only searches the eligible pool; can't bypass the other person's preferences or privacy |
| Safety classifier | V1 (rules) → V2 (ML/LLM) | Messages, profiles | Risk labels/scores | High-recall; humans review penalties |
| Photo checks | V1 | Images | Face/nudity/AI-generated/duplicate | Vendor + pHash; human appeal |
| Topic detection | V2 | Chat text | Topic coverage suggestions | User confirms ("Mark as discussed") |
| Translation | V3 (Gold) | Message | Translated message + original | Clearly labelled; tone-preserving; Egyptian/Gulf/Levantine/Maghrebi dialect support |
| Voice intro transcript | V3 | Audio | Transcript | Moderation |
| Marriage Readiness narrative | V2 | Assessment scores | "Areas to discuss" | No pass/fail verdicts; links to human professionals |

**Religious-content policy for AI:** the assistant may share neutral, widely accepted general information and point to the Advisory Board's curated content. It must not issue rulings (fatwas), rank users' religiosity, or take sides between madhhabs/sects. A standard response for ruling-type questions: *"For religious rulings, please consult a qualified scholar. Here are resources reviewed by our advisory board."*

---

## 3. Trust & Safety

### 3.1 Verification levels
| Badge | Method | Required for |
|---|---|---|
| 🟢 Basic | Phone OTP + email | Using the app |
| 🔵 Identity | Government ID + liveness selfie matched to profile photos | Serious Interest, video calls, Meeting Mode, being shown to "verified-only" users |
| 🟣 Profession | Work email domain verification, or document review | Optional |
| 🟡 Education | University email or certificate review | Optional |
| 🟠 Marital status | Document review where lawful and culturally appropriate (e.g. divorce certificate) | Optional; never shows the document |
| 🟢 Family | Guardian phone verified + attestation | Optional |

### 3.2 Risk engine (scam & abuse)
Signals combine into a per-account risk score (0–1) updated in real time:

| Signal | Example |
|---|---|
| Money/crypto/gift-card language | "lend me", "visa fees", "USDT", "Western Union", AR: «حوّل لي», «سلفة», «فلوس الفيزا» |
| Off-platform pressure early | WhatsApp/Telegram/Instagram handles before Stage 4, especially combined with refusing video |
| Velocity | New account + messaging many users with similar text (minhash similarity) |
| Identity anomalies | Photo matches a known stolen/celebrity/AI image; ID country ≠ claimed location + VPN/emulator |
| Passport abuse | Cross-border romance scams are the most common pattern, so Passport requires 🔵 ID verification; signals include Passport destinations rapidly switched across many countries, mass interests to one destination, ID country ≠ home country claimed, and money or visa talk in cross-border chats (lower warning threshold). Passport is revoked (with refund review) on confirmed abuse |
| Romance-scam scripts | Military/oil-rig/doctor-abroad narratives, sudden emergencies |
| Refusal patterns | Repeatedly declines video verification but pushes intimacy or money |
| Device fingerprint | Linked to previously banned accounts |
| User reports | Weighted by reporter reliability |

Actions by threshold: **0.4** silent shadow review + limited reach → **0.6** inline warnings shown to recipients ("This profile has characteristics associated with suspicious activity") + forced re-verification → **0.8** auto-suspend pending human review. All penalties are appealable.

### 3.3 Content moderation
- **Pre-moderation:** photos, bios, interest notes, voice intros.
- **In-chat:** real-time classification; explicit images auto-blurred; harassment and threats escalate to a priority queue.
- **SLAs:** P0 (threats, minors, sextortion) < 1 h, 24/7; P1 (scams, harassment) < 12 h; P2 < 48 h.
- Moderators: bilingual (Egyptian, Gulf, Levantine, Maghrebi dialects), gender-balanced teams; female moderators handle reports from women by default if requested.

### 3.4 Meeting safety
Trusted-contact sharing, check-in timer, discreet help button, country-specific emergency numbers, post-meeting feedback ("Did you feel safe?").

### 3.5 Minors and coercion
- ID-verified 18+. Any indication of a minor → immediate suspension and review.
- **Coercion safeguard:** guardians can't create or control member accounts. A user can privately signal "I'm being pressured" from the Safety Center → confidential support resources; the guardian is not notified.

---

## 4. Privacy & legal

| Topic | Approach |
|---|---|
| Lawful basis | Contract (core service) + **explicit consent** for religious data, AI processing, guardian access, marketing |
| Laws to address | Egypt PDPL (Law 151/2020) & executive regulations; KSA PDPL; UAE PDPL (Federal Decree-Law 45/2021); Qatar PDPPL; Bahrain PDPL; Morocco Law 09-08; UK GDPR & DPA 2018; EU GDPR & DSA; US state privacy laws (CCPA/CPRA etc.), plus app-store dating-app policies |
| Data subject rights | In-app export, deletion, correction, consent withdrawal |
| DPIA | Required before launch (special-category data + profiling) |
| Encryption | TLS 1.3; AES-256 at rest; field-level encryption for C4; KMS key rotation |
| Access control | Least privilege; break-glass access for moderators with reason codes; full audit log |
| Messages | Encrypted at rest; not end-to-end encrypted in V1 because safety scanning is required (disclosed transparently). Evaluate client-side safety scanning + E2EE later |
| Location | Area-level only; no live location storage; meeting check-in sharing is opt-in and temporary |
| Data selling | Never; contractual and in the privacy policy |
| Pen tests | Before launch + annually; bug bounty after V1 |
| Content rules | Country-specific legal review of features (e.g. family rooms, events, mixed-gender events) in each launch market |

---

## 5. Admin dashboard (internal console)

| Module | Capabilities | Roles |
|---|---|---|
| **Overview** | Live KPIs: signups, verifications, feed impressions, interests sent, matches, family introductions, engagements, revenue, safety queue size | All staff |
| **Users** | Search by phone/email/ID; profile view with C4 fields masked unless break-glass; status changes; entitlements; notes | Support, T&S |
| **Verification queue** | Vendor results, manual review for profession/education/marital docs; approve/reject with reasons | Verification ops |
| **Moderation queue** | Photos, bios, notes, flagged messages; bulk actions; keyboard-driven | Moderators |
| **Reports & cases** | Case management, evidence viewer, linked accounts graph, decisions, appeals, law-enforcement request log | T&S leads |
| **Risk engine** | Signal tuning, thresholds, keyword lists (AR/EN dialects), shadow-mode tests | T&S engineers |
| **Matching console** | Algorithm versions, weights, quality floor per market, fairness metrics, "why was X shown to Y" debugger | Data science |
| **Content / CMS** | Questions (AR m/f + EN), topic cards, etiquette reminders, templates, courses, success stories; Advisory Board approval workflow | Content, Advisory Board |
| **Pricing & offers** | Regional prices, trials, promo codes, Ramadan campaigns, A/B tests | Growth |
| **Billing** | Subscriptions, refunds, store reconciliation, Paymob/Fawry transactions, chargebacks | Finance |
| **Notifications** | Templates, budgets, campaign scheduler with prayer-time awareness, delivery analytics | Growth |
| **Events** | Create events, ticketing, attendee verification, check-in, post-event matching | Events team |
| **Concierge** | Client pipeline, matchmaker workload, notes, introductions, outcomes | Matchmakers |
| **Marketplace** | Vendor onboarding, listings moderation, commissions | Partnerships |
| **Compliance** | Data requests (export/delete) tracker, consent versions, audit log viewer, retention jobs | DPO |
| **Admin & RBAC** | Roles, permissions, SSO, 2FA enforcement, access reviews | Admin |

---

## 6. Payments implementation

- **Digital subscriptions & features inside the mobile apps** → App Store / Google Play billing (via RevenueCat), as required by store rules. Check the current regional alternative-billing options (some jurisdictions allow alternative or external payment links) and use them where permitted.
- **Human services, events, concierge** (consumed outside the app) → Stripe / Paymob / Fawry on web checkout where store rules allow.
- **Egypt:** Paymob (cards, Meeza, mobile wallets like Vodafone Cash) and Fawry (cash reference codes) for web purchases; localized EGP pricing; handle FX volatility with quarterly price reviews.
- **Entitlements service** is the single source of truth: it merges RevenueCat webhooks + Stripe/Paymob/Fawry webhooks → the `entitlements` table → cached in Redis → the app reads one `/me/entitlements` endpoint.
- Refunds, grace periods and billing retries are handled by store/provider webhooks; downgrade logic never deletes data (it just re-locks features).

---

## 7. Internationalisation & RTL

- i18n library: `i18next` with ICU messages; keys include gender variants (`_m`/`_f`) and plural rules (Arabic has 6 plural forms: zero, one, two, few, many, other).
- Professional translation + native review for **Egyptian and Gulf** audiences (MSA for UI, with dialect-aware tone in marketing).
- All user-generated content is stored with a detected language; bidi-safe rendering.
- RTL QA checklist per screen: mirrored layout, mirrored icons, number formatting, text truncation, mixed AR/EN names, keyboard switching, screenshots in both locales in CI (visual regression).
- Additional languages planned (V3): French (Maghreb/France), Urdu, Turkish, Malay/Indonesian, German.

---

## 8. Engineering delivery (MVP)

| Sprint block (2-week sprints) | Deliverables |
|---|---|
| S1–S2 | Design system (AR/EN, RTL), auth, OTP, accounts, consents, CI/CD, infra baseline |
| S3–S4 | Onboarding screens 1–20, profiles, photos + privacy, questions engine |
| S5–S6 | Matching v1 (filters, scoring, explanations), candidate queues & cursor-paginated feed API, exposure pacing, Top Picks batch, infinite Discover UI |
| S7–S8 | Interests, matches, structured chat, topic cards, stages, respectful close |
| S9–S10 | Guardian invite, permissions, dashboard (web + app), photo access requests |
| S11 | Verification vendor integration, risk engine v1, reporting/blocking, moderation console |
| S12 | Subscriptions (RevenueCat), entitlements, paywalls, notifications system |
| S13 | Hardening: pen test, load tests, accessibility, RTL QA, store submission, beta (closed) |
