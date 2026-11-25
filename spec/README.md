# HALAL MEET — Product Specification v1.0

### *Meet with intention. Marry with confidence.*
### *تعارف بنيّة صادقة، وزواج بثقة*

> **Positioning:** Halal Meet is a Muslim **marriage platform**, not a "halal Tinder." Serious intention, modesty, family involvement, safety and explainable compatibility are built into the product architecture — and they are also what makes people come back and pay.

---

## Document index

| # | Document | What's inside |
|---|---|---|
| 00 | **README** (this file) | Vision, principles, personas, journey, release plan, glossary |
| 01 | [Screens & UX](01-screens-ux.md) | 73 screens, screen-by-screen: purpose, elements, actions, states, gating, Arabic copy |
| 02 | [Engagement & Monetization](02-engagement-monetization.md) | Retention loops, notification system, gamification, pricing tiers, store, revenue model |
| 03 | [Data Model](03-data-model.md) | PostgreSQL schema, data classification, retention rules |
| 04 | [Matching Algorithm](04-matching-algorithm.md) | Filters, compatibility scoring, explanations, ranking, infinite Discover feed |
| 05 | [Architecture, AI, Safety & Admin](05-architecture-ai-safety-admin.md) | Tech stack, AI features, trust & safety, privacy/legal, admin dashboard, i18n/RTL |
| 06 | [Launch & Roadmap](06-launch-roadmap.md) | Global day-one launch with density mechanics (hub cities, Growing/Open countries), team, budget, KPIs, risks |

---

## 1. Product vision

Most dating apps optimise for **time spent**. Halal Meet optimises for **progress toward marriage** — and uses that progress as its engagement engine.

| Typical dating app | Halal Meet |
|---|---|
| Swipe → Match → Chat → Ghost | Discover → Match → Verify → Introduce → Communicate → Involve Family → Meet → Decide |
| Feed ranked by looks & popularity | **Infinite Discover feed ranked by mutual compatibility**: every card is explained, dealbreakers are never shown |
| "4 km away" | "**91% compatible** — here's why" |
| Empty chat box | **Structured conversation** with marriage topics & progress |
| Pay for attention (boosts) | Pay for **better matchmaking, deeper insight & real services** |
| Users churn when they succeed | Users **graduate** into Engagement Mode, wedding planning & marketplace |

### North-star metric
**Couples who reach "Family Introduction" per month** (leading indicator), with **confirmed engagements/nikahs** as the lagging truth metric.

### Brand promise
> **Real people. Serious intentions. Meaningful compatibility.**
> **Not more matches. Better matches.**

---

## 2. Product principles

1. **Intention first.** Every user declares a marriage intention and timeline. It is mandatory and drives matching.
2. **User owns the account.** Guardians participate by invitation and permission; they never secretly control an account.
3. **Choice, not one interpretation.** "Halal Mode" lets each user pick their interaction model (Private / Guided / Wali-involved). The app does **not** issue religious rulings.
4. **Compatibility, never judgment.** No "Islam score," no piety ranking. Religious data is used only for compatibility.
5. **Explain everything.** Every introduction comes with "Why we match" and "Things to discuss."
6. **Privacy by default.** Photo privacy levels, approximate location only, no data selling — ever.
7. **Sticky through meaning.** We create daily and weekly reasons to return (an always-fresh Discover feed, daily Top Picks, journey progress, compatibility reveals, family loop) — and we explicitly ban dark patterns (see 02 §9).
8. **Earn when users succeed.** Monetization scales with outcomes: deeper insights, services, events, and the post-engagement wedding ecosystem.
9. **Safety is a free feature.** Verification, reporting, scam detection and meeting safety are never paywalled.
10. **Bilingual & RTL native.** Arabic and English are first-class from day one, including gendered Arabic copy.

---

## 3. Target personas

| Persona | Description | Primary needs | Likely tier |
|---|---|---|---|
| **Ahmed, 29, Cairo** | Engineer, practicing, family wants to be involved | Serious matches, family-friendly flow, efficient | Plus |
| **Sara, 26, Alexandria** | Pharmacist, wears hijab, cautious about safety | Photo privacy, verified men only, wali involvement | Free → Plus |
| **Omar, 34, London** | Diaspora professional, Egyptian heritage, open to relocating | Passport to Egypt/GCC, Travel mode for summer visits home, language filter, cultural fit | Gold (or Plus + Passport add-on) |
| **Mariam, 38, Dubai** | Divorced, one child, senior manager | Discretion (incognito), mature matches, respect for her situation | Gold / Elite |
| **Yusuf, 31, Hamburg** | Convert, learning Arabic | Welcoming community, education, translation | Plus |
| **Hajj Mahmoud, 61** | Father of Sara, Guardian | Simple dashboard, Arabic, approve progression, talk to other family | Guardian (free) |
| **Layla, 42, Riyadh** | Busy executive, wants hands-on help | Human matchmaker, privacy | Elite |

---

## 4. Core journey: "From Match to Nikah"

```
Download → Verify → Build Marriage Profile → Set Religion/Family/Lifestyle preferences
   → Discover feed + Top Picks (AI compatibility) → "Ask Before You Match" → Express Interest
   → Mutual Match → Structured Conversation (5 stages, topic coverage)
   → Invite Guardian → Family-to-Family Room → Family Video Meeting
   → Real-world Meeting (Meeting Mode + safety check-in)
   → "Ready to proceed?" → Engagement Mode → Nikah checklist → Marriage
   → Success Story & Marketplace
```

Each connection has a visible **Journey Bar**:

`❤️ Discover → 🤝 Match → 💬 Get to Know → 👨‍👩‍👧 Families → 💍 Engagement → 🕌 Nikah → 🏠 Marriage`

---

## 5. Halal Mode (interaction model)

Chosen during onboarding; changeable any time; **visible to matches** so expectations are aligned before chatting.

| Level | Name (EN / AR) | Behaviour |
|---|---|---|
| 1 | **Private Introduction** / تعارف خاص | Direct 1:1 chat. Etiquette reminders on. Guardian optional. |
| 2 | **Guided** / تعارف موجَّه | Structured stages, suggested questions, conversation boundaries (no photo sending until Stage 3, no external contact exchange until Stage 4 unless both opt out), gentle reminders. |
| 3 | **Wali / Family Involved** / بحضور الولي | Guardian is a participant: sees approved info, can read/join chats (as configured), joins calls, approves stage progression, talks to the other family. |

Matching respects Halal Mode compatibility (e.g. a Level-3 user can require matches to accept guardian presence).

---

## 6. Release plan (summary — details in 06)

| Release | Timing | Scope |
|---|---|---|
| **MVP (V1)** | Month 0–6 | Registration, profiles, religious & marriage preferences, compatibility v1 (rules-based), infinite Discover feed + Top Picks, interest/match, structured messaging, verification (phone + ID/selfie), reporting/blocking, guardian invitation & dashboard (basic), photo privacy, subscriptions (Plus/Gold), **Passport ✈️**, Growing/Open country pools, Arabic + English. **Launches globally.** |
| **V2** | Month 7–12 | AI explanations & matchmaking ranking, AI conversation assistant, video calls (private/guardian/family), family rooms, advanced verification, full compatibility reports, marriage readiness, events, weekly insights, AI translation |
| **V3** | Month 13–24 | Human matchmaking & Concierge (Elite), courses, Engagement Mode + wedding planner, marketplace, voice intros, more languages |

---

## 7. Important brand & legal notes

- **Arabic name warning:** a direct transliteration "حلال ميت" reads as "halal **dead**" (ميت = dead). **Do not transliterate.** Recommended Arabic brand: **«لقاء حلال»** (*Liqaa' Halal*, "Halal Meeting") or keep the Latin "HALAL MEET" wordmark in Arabic UI. Validate with native-speaker focus groups in Egypt and KSA before launch.
- Halal Meet does **not** provide religious certification or rulings. Standard copy:
  > "Designed around principles of intentional Muslim marriage, privacy, respect and family involvement."
  > «مصمَّم وفق مبادئ الزواج الإسلامي الهادف، والخصوصية، والاحترام، ومشاركة الأسرة.»
- Establish a **Shariah Advisory Board** (scholars from multiple schools/regions) to review interaction rules, monetization, AI behaviour, advertising and content.
- Users must be **18+** (or the local legal age of majority if higher). ID verification enforces it.
- Religious belief is **special-category data** under GDPR/UK GDPR and sensitive data under Egypt, KSA and UAE data protection laws — explicit, granular consent required (see 05).

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Discover feed** | Infinite, compatibility-ranked stream of profiles; every card is explained |
| **Top Picks** | A small daily set of the highest mutual-compatibility profiles, pinned at the top of the feed |
| **Introduction** | A recommended profile card (in the feed or Top Picks), with compatibility explanation |
| **Passport** | Paid feature to browse and match in other countries; always transparent about the user's real home city and purpose |
| **Travel mode** | Passport scheduled for future trip dates, so locals can see you before you arrive |
| **Daily interests** | Number of "I'm interested" actions per day (Free: 10; Plus/Gold: unlimited) |
| **Interest / Serious Interest** | The two levels of "like"; Serious Interest is scarce and signals readiness to move forward |
| **Match** | Mutual interest → conversation unlocked |
| **Stage** | One of six structured conversation stages |
| **Topic coverage** | Count of key marriage topics both parties have discussed (e.g. 12/15) |
| **Guardian** | Invited wali/family member with scoped permissions |
| **Family Room** | Controlled channel connecting both families |
| **Compatibility Profile** | A user's answers + importance weights + dealbreakers |
| **Discuss flag (⚠)** | A topic where two users differ and one/both consider it important |
| **Journey** | The stage progression of a single connection, from Match to Nikah |
| **Graduation** | Leaving matchmaking because of engagement — celebrated, not churn |
