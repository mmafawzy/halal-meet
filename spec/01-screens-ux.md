# 01 — Screens & UX

← [Back to index](README.md)

## 0. Design system essentials

### Visual identity
Modern Islamic, not clichéd. No mosque silhouettes or crescents everywhere, and no green-and-gold overload.

| Token | Value | Use |
|---|---|---|
| `navy-900` | `#0F1B2D` | Primary text, headers, dark mode background |
| `ivory-50` | `#FBF7F0` | Light background |
| `emerald-600` | `#2F7A64` | Primary actions, compatibility positive |
| `gold-500` | `#C9A24B` | Premium, milestones, celebration accents |
| `sand-300` | `#E6D9C3` | Cards, dividers |
| `amber-500` | `#D98E2B` | "Discuss" flags |
| `rose-600` | `#B4435A` | Destructive / safety alerts (used sparingly) |

- **Pattern language:** subtle 8-point geometric star lattice as a background texture at 3–5% opacity; the logo's link between **HALAL** and **MEET** is a single geometric knot line.
- **Typography:** Latin = *Inter* / display *Fraunces*; Arabic = *IBM Plex Sans Arabic* (UI) / *Noto Naskh Arabic* (display, quotes). Arabic sizes +1 step vs Latin for legibility.
- **Motion:** calm, purposeful. Celebration moments (Match, Stage complete, Engagement) use a gold geometric "bloom" animation (≤1.2 s, skippable, respects Reduce Motion).
- **Haptics:** light tap on interest, success pattern on match/milestones.

### RTL & bilingual rules (apply to every screen)
- All layouts built with logical properties (`start`/`end`), mirrored in Arabic. Icons with direction (back arrows, progress, chat bubbles) mirror; logos, media controls and numerals in charts do not.
- **Gendered Arabic copy:** every string has masculine/feminine variants keyed by the *viewer's* gender and, where relevant, the *subject's* gender (e.g. «مهتم» / «مهتمة»). i18n keys: `intro.interested.m`, `intro.interested.f`.
- Numerals: user setting — Western (1 2 3) or Eastern Arabic (١ ٢ ٣). Default Western in Egypt and Eastern in KSA (to be validated in testing).
- Dates: Gregorian by default, with optional Hijri display.
- Mixed-direction text (names, cities) is wrapped in bidi isolation.

### Bottom navigation
| Tab | EN | AR | Badge logic |
|---|---|---|---|
| 🏠 | Discover | اكتشف | Dot when new compatible profiles joined or Top Picks refreshed |
| ❤️ | Matches | التوافقات | Count of new mutual matches + new interest |
| 💬 | Conversations | المحادثات | Unread count |
| 👨‍👩‍👧 | Family | العائلة | Guardian actions pending |
| 👤 | Profile | حسابي | Profile-strength nudges only |
| ✨ | AI Matchmaker *(Gold)* | الخاطبة الذكية | Appears as a floating button on Discover, not a 6th tab |

### Gating legend
`[F]` Free · `[P]` Plus · `[G]` Gold · `[E]` Elite · `[$]` One-time purchase · `[ALL]` Never paywalled

---

## A. Onboarding (screens 1–20)

Onboarding target: **≤ 12 minutes** to a usable profile. Progress is saved after every screen. A visible progress ring shows **"Profile strength"**, and copy reinforces the payoff: *"Every answer makes your introductions smarter."*

### 1. Splash
- Logo animation (the HALAL–MEET knot drawing itself), 1.5 s max.
- Checks auth state → Home, onboarding resume, or Welcome.

### 2. Language selection
- **العربية** / **English** (large buttons), with device-language preselection.
- Later changeable in Settings. Sets RTL immediately.

### 3. Welcome carousel (3 cards)
1. *"Not more matches. Better matches."* / «ليس مزيدًا من التوافقات، بل توافقات أفضل.»
2. *"Know why you're compatible — before you say salam."* — shows a sample "Why we match" card.
3. *"Involve your family, your way."* — shows the Halal Mode levels.
- CTA: **Get started** / **ابدأ الآن** · secondary: *I'm a guardian* (→ Guardian flow, screen 43).

### 4. Sign up
- Phone number (primary, with OTP) + email. Apple / Google sign-in as alternatives (phone still required for verification).
- Checkboxes: Terms, Privacy Policy, **explicit consent to process religious information for matching** (separate, unticked, required to use religious matching; users may decline and still use the app with reduced matching).
- Age gate: date of birth → block if under 18.

### 5. OTP verification
- 6-digit code, auto-read on Android, resend after 30 s, WhatsApp fallback in MENA.
- Awards 🟢 **Basic Verified** status.

### 6. Intention gate (mandatory)
- *"What brings you to Halal Meet?"*
  - Marriage within 6 months · within 1 year · within 1–2 years · Getting to know someone seriously · Not sure yet
- Copy: *"Halal Meet is for people seeking marriage. Your timeline helps us introduce you to people on the same page."*
- "Not sure yet" users are shown mostly to each other and get a gentle 30-day re-ask.

### 7. Halal Mode selection
- Three illustrated cards (Private / Guided / Wali-Family) with plain-language descriptions and an *"Is this religiously required?"* info link → neutral explainer + disclaimer.
- Second question: *"Which modes are you comfortable matching with?"* (multi-select).

### 8. Basic info
Name (first name shown; family name private), gender, date of birth (shows age), nationality, country, city/area (autocomplete; stored at area level), languages (multi + proficiency), height, marital status (never married / divorced / widowed / annulled), children (none / have, living with me / have, not living with me), wants more children (asked later), smoking.

### 9. Education & profession
Education level, field, university (optional; enables 🟡 Education verification later), profession, industry, employer (optional, private by default; enables 🟣 Profession verification).

### 10. Photos & photo privacy
- Upload 1 main photo (required for identity verification, **not necessarily shown**) + up to 5 more.
- **Visibility level** per profile (overrideable per photo):
  - 🌐 **Public to introductions** · 🤝 **Matches only** · 🔐 **Request to view** · 👨‍👩‍👧 **Family/Guardian only**
- **Blur mode** preview: shows exactly what others will see.
- AI checks: face present, single person, no nudity, not AI-generated, not duplicate/stolen (reverse lookup) → immediate feedback.
- Hint: *"Profiles with a verified photo — even if private — get 2.4× more serious interest."* (use real data once available)

### 11. Religious practice
All optional except where the user chooses to make them matching criteria. Each item has a **"Show on profile / Use for matching only / Skip"** toggle.
- Prayer: 5 daily · Usually · Sometimes · Rarely · Prefer not to say
- Fasting: Ramadan · Ramadan + voluntary · Occasionally · Not currently
- Orientation: Sunni · Shia · Other · Prefer not to say → optional madhhab (Hanafi, Maliki, Shafi'i, Hanbali, Ja'fari, Other, Prefer not to say)
- Quran: Learning · Reads regularly · Hafiz/partial hifz
- Mosque attendance, Islamic education, revert/convert (and year — optional, private by default)
- For women: hijab/niqab (wears / sometimes / no / prefer not to say); for men: beard (yes / trimmed / no)
- Lifestyle: halal food strictness, alcohol, music, gender-mixed environments

### 12. Partner religious preferences
Mirror of screen 11, asking about the partner: *"What would you prefer in a spouse?"* Each answer gets an importance: **Dealbreaker · Must have · Important · Flexible**.

### 13. Marriage intentions & life plan
- Wants children? How many? When?
- Where to live after marriage (same city / open to other city / open to other country — select countries)
- Living arrangement: independent home / near parents / with parents / flexible
- Both spouses working? Household roles: traditional / shared / flexible
- Polygamy stance (sensitive; private, matching-only, phrased neutrally and reviewed by the Advisory Board)
- Mahr & wedding expectations (optional, matching-only, ranges)

### 14. Values importance grid
Rows: Religion, Family, Education, Career, Children, Financial responsibility, Lifestyle, Location, Culture/Ethnicity, Language.
Columns: **Dealbreaker / Must have / Important / Flexible**. Drag-to-rank alternative on small screens.

### 15. Dealbreakers review
- Summarises every Dealbreaker chosen: 🚫 Smoking · 🚫 No children · 🚫 Living with parents …
- Live counter: *"About 1,240 people near you match your must-haves."* If very low: *"Your dealbreakers exclude 94% of profiles. Consider making 1–2 of them 'Important'."* (shows which ones would have the biggest effect)

### 16. Starter marriage questions (10 of 120)
- Card-stack UI, one question per card, 3–5 answer options plus *"Explain more"* free text (optional).
- Mixed categories: Marriage, Religion, Family, Finance, Children.
- After 10: *"Great! Answer more any time to unlock deeper compatibility."* (→ Question Library, screen 51)

### 17. AI bio assistant ("About me")
- User writes freely, or answers 3 prompts ("What do you value most?", "A perfect weekend?", "What kind of home do you want to build?").
- **Polish with AI** → 2–3 suggested versions (warm / concise / detailed), in either language. User edits and approves; AI text is never published without approval.
- Moderation: removes contact info, inappropriate content, and money solicitation.

### 18. Voice introduction *(optional; recording free, featured placement Plus)*
- 30-second recording with prompts: "Introduce yourself as you would to a family."
- Transcript auto-generated (accessibility + moderation). Voice can be set to Matches-only.

### 19. Identity verification
- Government ID scan + liveness selfie (vendor SDK) → 🔵 **Identity Verified**.
- Copy: *"Your documents are never shown to anyone. Verified profiles are prioritised in introductions."*
- Skippable for now, but required before sending Serious Interest, entering video calls, or Meeting Mode. Unverified profiles are shown only to users who allow unverified profiles (default: off for women).

### 20. Guardian & notifications setup
- **Add a Guardian now?** (Father / Mother / Brother / Sister / Uncle / Aunt / Other trusted person) → invite via WhatsApp/SMS/link. Skip allowed (unless Halal Mode 3).
- **Choose your Top Picks time:** default *after Maghrib*, with prayer-time-aware options or a custom time. *"Your feed is always open, and your hand-picked best matches refresh every evening."*
- Notification permission prompt **after** this explanation (higher opt-in).
- Finish → **"Your first introductions are ready"** celebration → Home.

---

## B. Discover (screens 21–29)

### 21. Home / Discover feed (infinite)
```
┌─────────────────────────────────────┐
│ Good evening, Ahmed 🌙  [🔔] [⚙] [⚲] │
│ Your intention: Marriage · 1 year   │
│ ─────────────────────────────────── │
│ ⭐ TOP PICKS TODAY  ◯ ◯ ◯ ◯ ◯ →      │  ← horizontal row, refreshes daily
│ 🆕 27 new compatible profiles since │
│    your last visit                  │
│ ─────────────────────────────────── │
│ ┌─────────────────────────────────┐ │
│ │ [photo / blurred / initials]    │ │
│ │ Sara, 27 · New Cairo  ✓ID ✓Fam  │ │
│ │ 91% compatible                  │ │
│ │ ✓ Similar prayer practice       │ │
│ │ ✓ Both want 2–3 children        │ │
│ │ ⚠ Discuss: working after marriage│ │
│ │ [Why we match]                  │ │
│ │ [✕ Not for me]  [♥ Interested]  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Mariam, 25 · Heliopolis  88%    │ │
│ │ …                               │ │  ← vertical, endless scroll
│ ♥ 7 of 10 interests left today [F]  │
└─────────────────────────────────────┘
```
- **Infinite vertical feed** of full-width profile cards (tap → full profile). Swipe gestures are optional shortcuts (right = Interested, left = Not for me) with a 3-second undo toast. Buttons are the primary input, which keeps the experience deliberate.
- **Ordering:** descending mutual compatibility rank (see 04 §4), so the strongest matches come first. Passed profiles don't reappear for 90 days.
- **Pinned at the top:**
  - ⭐ **Top Picks:** `[F]` 3/day · `[P]` 6/day · `[G]` 10/day + 1 human/AI **Curated Pick**. Refreshes at the user's chosen time; a daily reason to return.
  - 🆕 **"New since your last visit"** counter, which jumps to the newest compatible profiles.
  - ⭐ **Seriously interested in you:** anyone who sent Serious Interest is always pinned (free users included).
- **Inline cards** interleaved in the feed (max 1 per 12 profiles): Today's question, Compatibility Reveal prompts, profile-strength nudges, events near you, success stories, and at most one upsell per session.
- **Daily interests:** `[F]` 10 "I'm interested" per day (resets at local midnight; counter visible) · `[P]`/`[G]` unlimited. Browsing and "Not for me" are always unlimited.
- **Mindful-browsing card:** after ~60 cards in a session with no interest sent, show *"Not seeing the right people? Adjust your preferences or answer a few questions to sharpen your matches."* This catches mismatched settings before the user churns.
- **Compatibility tiers in the feed:** cards ≥ the market quality floor (default 65%) show normally. Below it, a divider appears: *"You've seen your strongest matches. Continue with broader matches?"*, followed by labelled **Broader matches** (still never violating dealbreakers).
- **End of pool** (small markets): *"You've seen everyone who fits your must-haves right now. New members join daily."* plus options: widen distance, relax an "Important" item, answer questions, or **✈️ explore another country with Passport** (shows live counts, e.g. *"1,840 compatible profiles in the UAE"*).
- Banner slots (max 1 at a time): verification nudge, guardian invite.

### 22. Introduction profile (full view)
Sections: header (name, age, area, verification badges, Halal Mode badge, and for Passport users a **✈️ Passport badge** showing their real home city and purpose, e.g. *"Lives in London · Moving to Dubai in 2027"*), compatibility ring, About me, voice intro, Religion (shown fields only), Marriage plans, Family, Education & career, Languages, Interests, *"Answers you have in common"* (3–5 question cards).
- Photo states: visible / blurred with **Request to view** / Family-only lock.
- Actions (sticky): **Not for me** · **I'm interested** · **Seriously interested ⭐** · overflow (report, block, share with guardian).
- **Share with guardian** → sends a read-only card to the guardian dashboard for their opinion ("What do you think?" 👍/🤔/👎 + note).

### 23. "Why we match" report — the killer feature
- Overall % + 5 dimension bars: **Religion · Family · Children · Lifestyle · Finance · Timeline · Location** (shows only dimensions with data).
- Each bar expands into plain-language reasons generated from answers: *"Both of you pray 5 times daily and want an Islamic home environment."*
- **⚠ Discuss** section: *"You prefer Islamic schooling; she prefers private international schooling."* plus a suggested opening question.
- **Depth levels:**
  - `[F]` overall % + top 3 reasons + 1 Discuss flag
  - `[P]` all dimensions + all reasons + all Discuss flags
  - `[G]` AI deep report: *"How your differences could work"* + a conversation plan
  - `[$]` downloadable PDF Compatibility Report to share with family
- **Compatibility Reveal hook:** *"Answer 5 more questions to reveal Finance compatibility with Sara."* (free; drives question answering)

### 24. Ask Before You Match
- Shown before an Interest action when the other user has set "key facts" (up to 5): *"Ahmed wants to live independently. Ahmed prefers his wife to work."*
- Per fact: **Compatible · Not compatible · Let's discuss**. Any "Not compatible" → *"Are you sure you want to continue?"* (lowers wasted matches).
- Answers are shared with the other user only on mutual match.

### 25. Interest sheet
- **I'm interested** (`[F]` 10/day · `[P]`/`[G]` unlimited) and **Seriously interested ⭐** (`[F]` 1/week · `[P]` 3/week · `[G]` 1/day). Scarcity keeps the signal meaningful; it is **never sold individually**.
- Optional **"Add a note"** with a respectful prompt library (*"Your answer about family closeness resonated with me…"*). Notes are moderated. `[P]`+ can add notes to every interest; `[F]` only with Serious Interest.

### 26. Not for me — feedback
- Optional one-tap reason (Religion fit / Location / Age / Life plans / Just not a fit / Prefer not to say) → re-ranks the rest of the feed in real time. Never shown to the other person.
- *"Thanks — your feed will reflect this."*

### 27. Daily interest limit reached `[F]`
- Shown when a free user taps "I'm interested" after using all 10: *"You've used today's 10 interests. They refresh in 6h 12m."*
- Options: **Save for later** (bookmark the profile; it stays at the top of the feed tomorrow) · **Upgrade to Plus for unlimited interests** · keep browsing (browsing is never limited).
- Serious Interest (weekly allowance) is still available if unused.

### 28. Filters & preferences
- `[F]` age, distance (10/25/50/100 km, same city, anywhere in my country), intention timeline, marital status, Halal Mode compatibility.
- `[P]` advanced: education, profession, languages, height, religious practice details, relocation willingness, has children, verified-only, active within 7 days.
- ✈️ **Other countries require Passport** (screens 71–73): a locked "Search in another country" row opens the Passport sheet. Included in `[G]`/`[E]`; sold separately as a pass or add-on.

### 29. AI Matchmaker chat *(Gold)*
- Conversational: *"Find me someone who's practicing but relaxed about music, ideally in the Gulf, open to me relocating."*
- Responds with a reasoned shortlist (from the eligible pool, compatibility-gated) and explains trade-offs. Max 3 extra introductions/day.
- Weekly "Matchmaker notes": *"You tend to pass on people who want to live near parents. Should I treat that as a dealbreaker?"*

---

## C. Matches (screens 30–33)

### 30. Matches hub
Tabs: **Mutual** · **Interested in you** · **Your interests** · **Passed (Undo)**
- Each mutual match shows a journey stage chip and a last-activity date. Expiring matches (no message in 7 days) show a gentle timer: *"Say salam within 3 days or the match closes respectfully."* (prevents limbo, creates healthy urgency)

### 31. Interested in you
- `[F]` count + blurred cards + compatibility % visible (*"3 people are interested — 2 are 85%+ compatible"*). They are boosted within your Discover feed, so you'll likely meet them naturally.
- `[P]` full list, profiles, notes.
- Serious Interest is always shown to free users (⭐ *"Someone is seriously interested"* → pinned at the top of the Discover feed immediately). This ensures serious intent is never hidden behind a paywall.

### 32. Mutual match celebration
- Full-screen gold bloom: **"It's a match, in sha Allah"** / «تمّ التوافق بإذن الله»
- Shows top 3 reasons + 1 Discuss flag + suggested first message chips.
- CTAs: **Send salam** · **Share with my guardian**.

### 33. Undo / passed `[P]`
- Revisit passes from the last 30 days (free users get the 3-second undo toast only).
- **Saved** profiles (bookmarked, e.g. when the daily interest limit is reached) also live here.

---

## D. Conversations (screens 34–42)

### 34. Conversations inbox
- Sections: **Your move** (awaiting your reply), **Their move**, **Family rooms**, **Closed**.
- Each row: avatar, name, journey chip, topic coverage ring (e.g. 8/15), last message.
- "Your move" ordering + reply nudges reduce ghosting.

### 35. Structured chat
```
┌─────────────────────────────────────┐
│ ← Sara   ✓ID  [📞] [👨‍👩‍👧] [⋮]       │
│ Stage 2 of 6 · Values   ███░░░       │
│ Topics covered: 8 of 15  [view]      │
├─────────────────────────────────────┤
│  …messages…                          │
│  ┌ Suggested ──────────────────────┐ │
│  │ 💡 You haven't discussed living │ │
│  │ arrangements yet. Ask:          │ │
│  │ "What living arrangement would  │ │
│  │  make you most comfortable?"    │ │
│  │ [Send] [Edit] [Not now]         │ │
│  └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [🗂 Topics] [Type a message…]  [🎙] │
└─────────────────────────────────────┘
```
- **Stage bar:** 1 Introduction · 2 Values · 3 Expectations · 4 Serious discussion · 5 Family introduction · 6 Meeting. Progress is derived from topic coverage and mutual "Ready for next stage" taps.
- **Topic cards:** a structured question message type. Both answer, then both answers are revealed together (curiosity hook; avoids anchoring).
- Message types: text, voice note (`[P]` beyond 30 s), topic card, photo (only if Halal Mode allows at the current stage), Request-photo-access, schedule call, location of a public meeting place (no live location).
- Read receipts `[P]`. Typing indicator `[F]`.
- Guardian presence shown in the header when active: *"Hajj Mahmoud (Sara's father) can read this conversation."*
- **AI translation toggle** `[G]` (V3): inline translate with an "original" toggle.

### 36. Topic library
- 15 core topics (the coverage metric) + 100+ optional prompts, grouped: Marriage, Religion, Family, Finance, Children, Lifestyle, Health & wellbeing (sensitive, opt-in), Past marriage (for divorced/widowed users, opt-in).
- Each topic shows ✓ covered / ○ not yet / ⚠ differing answers.

### 37. AI conversation assistant *(suggestions: [F] 3/day, [G] unlimited + coaching)*
- Suggests the next question based on uncovered topics and the Discuss flags.
- `[G]` **Coach mode** (private to the user): *"You've asked 9 questions and shared little about yourself — consider answering her question about career plans."*
- Never sends messages autonomously; never impersonates.

### 38. Safety interstitials (inline) `[ALL]`
- Triggered by risk detection: money requests, crypto, off-platform pressure, explicit content, aggression.
- *"⚠ This message asks for money. Never send money to someone you met on Halal Meet."* → [Report] [I understand].
- Explicit images are blurred automatically, with "View anyway / Report."

### 39. "Are you ready to proceed?"
Shown when topic coverage ≥ 12/15 or Stage 4 is completed:
- **Continue privately** · **Involve family** (→ guardian invite / Family Room) · **End respectfully**
- Copy: *"You've discussed most of the major marriage topics."*

### 40. End respectfully (respectful rejection)
- Templates (editable), AR/EN:
  - EN: *"Thank you for getting to know me. I don't think we're the right match, but I sincerely wish you the best."*
  - AR: «شكرًا لك على وقتك في التعارف. لا أظن أننا الأنسب لبعضنا، وأتمنى لك كل الخير.»
- Closing card shown to both: *"May Allah grant you what is best."* / «أسأل الله أن يكتب لك الخير حيث كان.»
- Optional private reason (feeds matching). Conversation becomes read-only, then auto-deletes after 30 days unless reported.
- **Auto-close:** after 10 days of one-sided silence, a respectful close is offered/sent automatically, so nobody is left ghosted.

### 41. Photo access request
- The requester sees *"Request sent"*. The owner gets: Approve (this person) / Approve after guardian review / Decline (silent).
- Grants are revocable at any time; access logs are visible to the owner.

### 42. Video call setup *(V2; [F] 2 calls/week of 20 min, [P] unlimited 45 min, [G] unlimited + family rooms 90 min)*
- Choose: **Private** · **Guardian included** · **Both families included**
- Pre-call checklist: lighting, guardian invited, *"Calls are not recorded by Halal Meet."*
- In-call: blur background, end/report button, timer, guardian join indicator.
- Requires 🔵 Identity Verified for both.

---

## E. Family (screens 43–49)

### 43. Guardian onboarding (separate light app mode)
- Opens from an invite link → lightweight sign-up (phone + OTP + name + relationship). Arabic-first; large text option.
- Explains the role: *"You've been invited by Sara to support her search. Sara controls what you can see."*
- Guardians cannot browse other users or appear in matching.

### 44. Guardian permissions (user side)
Granular per guardian:
| Permission | Default (Mode 2) | Default (Mode 3) |
|---|---|---|
| See my introductions & matches | ✓ | ✓ |
| See compatibility reports | ✓ | ✓ |
| Read conversations | — | ✓ |
| Participate in conversations | — | ✓ |
| Join video calls | — | ✓ |
| Approve stage progression (5, 6) | — | ✓ |
| Communicate with the other family | — | ✓ |
| Receive safety alerts | ✓ | ✓ |
- Guardian presence is always **visible to the other party**; no silent monitoring.
- The user can pause or remove a guardian at any time (the guardian is notified neutrally).

### 45. Guardian dashboard
```
Sara has 3 active introductions
1. Ahmed — 87% · Stage 3 · ✓ID ✓Profession   [View] [Opinion]
2. Khaled — 84% · Matched · ✓ID              [View] [Opinion]
3. Youssef — 79% · Interest sent              [View]
Pending your approval: Ahmed → Family Introduction   [Approve] [Discuss with Sara]
Safety: all clear ✓
```
- Weekly guardian digest (push/WhatsApp opt-in) brings guardians back into the app each week.

### 46. Guardian opinion & private family chat
- Guardian leaves 👍/🤔/👎 + note on a profile; private user↔guardian thread per connection.

### 47. Family-to-Family Room
- Created when both users approve **Introduce Families**. Participants: both users + their opted-in guardians.
- Features: group chat, shared question set (*"Questions families often ask"*), family video meeting, meeting scheduler, contact exchange (only by mutual consent; shows a "both families agreed" stamp).
- Header: **Ahmed's family ↔ Sara's family** with both journey stages.

### 48. Meeting scheduler
- Propose 3 time slots; supports family meetings at home, mosques, cafés (public-place suggestions), or video.
- Calendar export; reminders.

### 49. Family verification
- A guardian confirms "This is my daughter/son and the profile is accurate" + their own phone verification → 🟢 **Family Verified** badge.

---

## F. Meeting & Journey (screens 50–55)

### 50. Meeting Mode
- First Meeting Guide: meet in public, tell someone, don't share sensitive info, suggested topics (based on uncovered topics).
- **Trusted contact share:** sends the meeting place and time window to a guardian/friend (not live GPS unless the user opts in).
- During the meeting window: discreet "I need help" button → call trusted contact / local emergency number.
- After: **"I'm safely home"** / «وصلتُ إلى المنزل بأمان» check-in; the trusted contact is notified. If there's no check-in within +2 h, the trusted contact is alerted.

### 51. Question Library ("Know yourself")
- 120+ questions across categories, progress per category, *"Answered 46/120."*
- **Today's question** (1/day, featured on Home): a fun-but-meaningful daily habit; the user sees afterwards how their matches answered (if they answered too).
- Each category completion unlocks that dimension in compatibility reports for all matches.

### 52. Journey timeline (per connection)
- Vertical timeline: Matched (date) → First message → Stage 2 → Topic 10/15 → Guardian joined → Families introduced → Met → Engaged.
- Gentle pacing suggestions (Day 1 Intro → Day 3 Values → Day 7 Expectations → Day 14 Family discussion → Day 21 Family introduction). Not mandatory.

### 53. Marriage Readiness *(V2; [P] self-assessment, [G] full report, [$] couple's report)*
- 40-question self-assessment: finances, emotional readiness, communication, family expectations, children, religion, lifestyle, conflict.
- Output: **"Areas to discuss before proceeding"**, not a pass/fail verdict. Links to courses.
- **Couple's version**: both answer, then see side-by-side areas of alignment and areas to discuss.

### 54. Engagement Mode *(V3)*
- Both users confirm **"We're engaged"** → gold celebration → both leave matchmaking (profiles hidden; subscription auto-pauses or converts to **Engaged plan**).
- Unlocks: Nikah checklist, wedding budget planner, housing checklist, family planning, marriage courses, marketplace (venues, photographers, jewellery, furniture, honeymoon), shared to-do lists, countdown.
- *"Share your story"* invitation (opt-in, anonymised options) → success stories feed.

### 55. Success stories
- Curated, consented couple stories (photos optional/illustrated). Social proof on the paywall, onboarding and in marketing.

---

## G. Profile, Privacy & Safety (screens 56–63)

### 56. My profile + strength meter
- Ring: Basic → Good → Strong → Excellent (based on completeness, verification, questions answered, voice intro, guardian).
- Each missing item shows its effect: *"+ Add profession verification → appear in Verified-only searches."*
- **Preview as others** (as an introduction / as a match / as a guardian).

### 57. Verification center
- Status of 🟢 Basic · 🔵 Identity · 🟣 Profession · 🟡 Education · 🟠 Marital status (where lawful) · 🟢 Family.
- `[$]`/`[G]` **Priority verification** (24 h SLA vs 72 h). Verification itself is free.

### 58. Privacy center `[ALL]` (+ Incognito `[P]`)
- Photo visibility, profile visibility (visible / **Incognito**: only people you've expressed interest in can see you `[P]`), **international visibility** (show me to Passport users from other countries: On / Only if they're relocating or moving / Off; default On, verified Passport users only), hide from contacts (phone-contact hashing to avoid relatives/colleagues), hide specific nationalities/cities, last-active display, read receipts.
- **Pause matchmaking** (keeps conversations), **Hide profile**, **Download my data**, **Delete conversations**, **Delete account & data**.

### 59. Safety Center `[ALL]`
- Report, Block, Unmatch, Suspicious profile, Financial scam, Harassment, Emergency contacts by country, safety guides, *"Never send money"* principle, status of your reports.

### 60. Report flow
- Category → details → evidence (auto-attaches the relevant messages with consent) → submit → status tracking. Block is applied immediately and optionally.

### 61. Settings
Language, numerals, Hijri dates, Top Picks refresh time, prayer-time quiet hours, notifications (granular), Halal Mode, guardians, connected accounts, subscription, help, legal.

### 62. Pause / delete flow
- Pause offers (1 week / 1 month / until I resume). Delete explains the consequences, offers a data export, and has no guilt-trip dark patterns. One extra confirmation only.

### 63. Notification center
- Grouped: Introductions, Matches, Messages, Family, Safety, Events, Account.

---

## H. Premium & Services (screens 64–70)

### 64. Paywall (contextual)
- Triggered by a locked feature, it shows **the specific value** (*"See all 3 people interested in you"*), the plan comparison, real success stories, and price with the annual saving.
- Free trial (where offered) shows the exact renewal date + a reminder 2 days before. **Cancel anytime in two taps.**

### 65. Plans compare
Free / Plus / Gold table (see 02 §6), with localized pricing.

### 66. Services store `[$]`
Profile Review (human or AI+human) · Compatibility Report PDF · Couple's Readiness Report · Matchmaker Consultation · Family Introduction Service (human coordinator) · Extra Top Picks pack · Priority verification · Event tickets.

### 67. Concierge (Elite) application
- Application form → intro call booking → assigned matchmaker profile → private dashboard of hand-selected introductions with matchmaker notes.

### 68. Events
- Listing (city, date, type: Professionals / Over 35 / Converts / Family-attended), verified-only attendance, ticket purchase, QR check-in, post-event "people you met" matching (both opt-in).

### 69. Learn (courses)
- Marriage 101 · Islamic Rights & Responsibilities · Financial Planning for Couples · Communication · Conflict Resolution · Raising Muslim Children · Understanding Nikah · Legal Rights of Spouses (per country). Free intro lessons, paid full courses, included in Gold at a discount.

### 70. Weekly Insight
- Every Friday (after Jumu'ah): *"This week: 34 people viewed your introduction card; your 'Family' answers resonated most; 2 matches are waiting on your reply; answering 'Finance' questions could reveal compatibility with 6 matches."*
- Plus a shareable (privacy-safe) "Compatibility personality" card, e.g. *"The Family Builder"*, which drives organic sharing.

---

## I. Passport ✈️ (screens 71–73)

**Halal Meet Passport** / «جواز سفر لقاء حلال» lets users match with people in other countries: for relocation, diaspora users seeking a spouse from "back home," or planned travel. Without Passport, the feed is limited to the user's own country.

### 71. Passport hub
```
┌─────────────────────────────────────┐
│ ✈️ Passport                     [?]  │
│ Currently: 🇪🇬 Cairo (home)          │
│ ─────────────────────────────────── │
│ 🔍 Search a city or country…        │
│ POPULAR FOR YOU                     │
│ 🇦🇪 Dubai      2,310 compatible  →   │
│ 🇸🇦 Riyadh     1,970 compatible  →   │
│ 🇬🇧 London       860 compatible  →   │
│ 🇩🇪 Germany      540 compatible  →   │
│ ─────────────────────────────────── │
│ 🌍 Worldwide mode            [Gold] │
│ 🗓 Plan a trip (Travel mode)         │
│ Recent: Dubai · Jeddah              │
└─────────────────────────────────────┘
```
- Destinations show **live compatible counts** (only people who pass both sides' dealbreakers and allow international visibility). Counts are computed honestly and never inflated.
- "Popular for you" is based on onboarding relocation countries, nationality/heritage, languages and diaspora links (e.g. an Egyptian in London sees Egypt first).
- Entry points: Discover header (✈️ icon), filters, end-of-pool card, AI Matchmaker (*"Find me someone in the Gulf"*), the relocation answer in onboarding, and a profile-view CTA when a foreign user's card is shared.

### 72. Passport activation & Travel mode
- Pick a destination (city or country) → **"Why are you exploring here?"** (required; shown on your card for transparency):
  - 🏠 *I'm willing to relocate here* · 📦 *I'm moving here* (with date) · 🗓 *I'm visiting* (dates) · 🔄 *I'd like my spouse to relocate to me* · 🌍 *Open to either*
- **Travel mode:** set future dates (*"In Cairo 1–20 August"*). Your card appears to people there from 14 days before arrival with *"Visiting Cairo 1–20 Aug"*. This is built for diaspora summer homecomings and Eid visits.
- Your feed switches to the destination: a ribbon *"✈️ Browsing Dubai · Return home"* stays visible, and one tap returns to home.
- `[G]` up to **3 active destinations** at once, blended into one feed; Worldwide mode ranks globally by compatibility.
- **Honesty rule:** you never appear as a local. Your card always shows your real home city plus the Passport badge and purpose.
- Requires 🔵 **Identity Verified** (anti-scam; see 05 §3.2).

### 73. Passport purchase sheet
| Option | What you get | Price (US anchor) |
|---|---|---|
| **7-day Passport Pass** | 1 destination, 7 days (or a Travel-mode trip up to 30 days) | $4.99 |
| **Passport add-on** (monthly) | Unlimited destination switches, 1 active at a time, Travel mode | $7.99/mo |
| **Gold** | Passport included, up to 3 destinations, Worldwide mode, AI translation | (Gold price) |
- `[P]` subscribers receive **one free 7-day Pass per quarter** (taste → upgrade to the add-on or Gold).
- Regional prices in 02 §6.2. Shows the live count for the chosen destination at purchase time (*"You'll see 2,310 compatible profiles in Dubai"*); if the count is under 50, warn before purchase.
- Messages and matches made via Passport stay open after the pass expires; replying is always free.
