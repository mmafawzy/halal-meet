# 04 — Matching Algorithm

← [Back to index](README.md)

## 0. Goals

1. **Never** introduce someone who violates a user's dealbreakers.
2. Rank by **mutual** compatibility; both sides must fit each other.
3. Make every recommendation **explainable** (reasons + Discuss flags).
4. Spread attention fairly so popular profiles aren't flooded and everyone gets seen. This matters most for women's experience and for retention across the board.
5. Learn from behaviour, **without** learning attractiveness bias or creating a "religiosity rank."

Pipeline:

```
Eligibility filters → Candidate generation → Pairwise compatibility (cached)
   → Ranking (compat + mutual-likelihood + responsiveness + freshness + fairness)
   → Feed pages + daily Top Picks (diversity, exposure pacing) → Explanation generation → Delivery
```

---

## 1. Eligibility (hard filters, both directions)

A candidate B is eligible for A only if **all** hold, checked from A→B **and** B→A:

| Filter | Rule |
|---|---|
| Account | B is active, not paused, hidden, engaged or suspended; profile minimum complete; photo approved |
| Gender | Opposite gender (per product scope) |
| Age | B's age ∈ A's range and A's age ∈ B's range |
| Location | B is inside A's home scope (radius on area centroids / city / country), **or** inside one of A's active Passport destinations (see §1.1) |
| Passport (cross-border) | If A and B live in different countries: B's `intl_visibility` ≠ off (and if `relocating_only`, A's Passport purpose must be relocate/moving); A must be ID-verified; B's own preferences (age, dealbreakers, verified-only) still apply in full |
| Intention | Timeline distance ≤ 1 bucket (e.g. "within 6m" ↔ "within 1y" OK; "within 6m" ↔ "unsure" excluded) |
| Halal Mode | B.halal_mode ∈ A.accepted_modes and vice versa |
| Dealbreakers | For every answer where importance = dealbreaker: the other's `self_value` ∈ `partner_accept`. **Unanswered = fail** if A marked "require an answer," otherwise pass but flag |
| Marital/children | Per match preferences |
| Verification | If A requires verified-only → B must be identity verified (default **on** for women seeking men) |
| Safety | No block either way; no prior pass within 90 days; no prior closed match; B's risk score < threshold; contact-hash exclusion (hide from contacts) |
| Exposure | Over-exposed profiles are demoted, not filtered (see §4.5) |

### 1.1 Passport rules
- **Without a Passport entitlement**, candidates are limited to the user's home country, or to the user's whole **home region** while their country has **Growing** status (density below threshold; see 06 §1). There is no free "worldwide" scope. When a country flips to **Open**, existing matches and conversations are unaffected.
- **Two-way visibility:** an active Passport user appears in the feeds of people in the destination (subject to their `intl_visibility`), so locals can discover them too. Locals don't need Passport to see or reply to them.
- **Travel mode:** a scheduled destination becomes visible to locals from `visible_from` (default 14 days before arrival); the Passport user can browse the destination as soon as it's purchased.
- **Location dimension (§2.3)** uses the Passport purpose: "relocate/moving" scores like a local match; "visiting" with neither party open to relocation produces a ⚠ Discuss flag (*"You live in different countries and neither has said they'd relocate"*).
- **Ranking:** Passport users get no ranking boost for paying. They're ranked by the same compatibility formula, with a small Freshness lift during Travel mode visit windows (time-relevant, not pay-relevant).
- **Gold multi-destination/Worldwide:** candidate queues are built per destination and merged by `rank`.

Implementation: SQL pre-filter on indexed columns (gender, country, age, status, geo) → in-memory filter on dealbreakers using bitsets per question option.

---

## 2. Pairwise compatibility

### 2.1 Item similarity

For each question *q* that both A and B have answered, compute **A's satisfaction with B**:

| Answer type | `sat_A(B, q)` |
|---|---|
| Ordinal (e.g. prayer frequency 0–4) | If A set `partner_accept`: 1 if B ∈ accept, else `max(0, 1 − d/range)` where d is the distance to the nearest accepted value. Otherwise: `1 − |a − b| / range` |
| Categorical | 1 if B's value ∈ A's accepted set (or equal to A's own if none set), else 0 (or a partial-credit matrix defined per question, e.g. "near parents" vs "with parents" = 0.5) |
| Multi-select | Jaccard(A.accept, B.values) |
| Range (e.g. # of children) | Overlap of the ranges / union length |

### 2.2 Importance weights

| Importance | Weight |
|---|---|
| Dealbreaker | (hard filter) + weight 6 |
| Must have | 4 |
| Important | 2 |
| Flexible | 0.5 |

### 2.3 Dimension scores

Dimensions: **Religion, Family, Children, Lifestyle, Finance, Career, Timeline, Location, Language**.

```
S_A→B(d) = Σ_q∈d  w_A(q) · sat_A(B,q)  /  Σ_q∈d  w_A(q)
```

**Mutual** dimension score uses the geometric mean, so a one-sided fit is penalised:

```
S(d) = sqrt( S_A→B(d) · S_B→A(d) )
```

A dimension is **revealed** only if both users have answered at least `k_d` questions in it (k = 3 for most dimensions). Otherwise it shows as "🔒 Answer N more to reveal" (the Compatibility Reveal hook).

### 2.4 Overall score

```
W_A(d) = importance weight A gave dimension d (value grid, screen 14)
Overall_A→B = Σ_d W_A(d) · S_A→B(d) / Σ_d W_A(d)
Overall     = sqrt(Overall_A→B · Overall_B→A)
Display %   = round(100 · calibrate(Overall))
```

`calibrate()` is a monotonic mapping (isotonic regression, fitted later on outcome data) so that displayed percentages are meaningful. Target: **85%+ ≈ top 10% of eligible pairs**. Until outcome data exists, use a percentile mapping within the user's eligible pool.

### 2.5 Explanations (reason codes)

Reasons are **structured first, then rendered** into language. The LLM only rephrases; it never invents facts.

- **Strength reasons:** items with `sat ≥ 0.9` on both sides and weight ≥ 2, sorted by combined weight. Example code: `{"code":"both_want_children","values":{"range":"2-3"}}` → EN *"Both want 2–3 children"* / AR «كلاكما يرغب في ٢–٣ أطفال».
- **Discuss flags (⚠):** items where `min(sat_A, sat_B) < 0.5` and `max(w_A, w_B) ≥ 2` (and not a dealbreaker, since those were already filtered). Each flag includes a suggested question.
- Free tier shows the top 3 reasons and 1 flag; Plus shows all; Gold adds an AI narrative: *"How your differences could work"*.

### 2.6 What we explicitly do NOT compute
- No individual "religiosity/Islam score." Religious answers are only compared pairwise against each user's own preferences.
- No attractiveness/ELO "desirability" score.
- No inferred sensitive attributes (e.g. guessing sect from a name).

---

## 3. Ranking model

For eligible candidates (top ~500 by Overall), compute:

```
rank = 0.55 · Overall
     + 0.15 · P_mutual        (predicted probability B reciprocates interest)
     + 0.10 · Responsiveness  (B's reply/respectful-close rate, last 30 days)
     + 0.08 · Freshness       (new users, recently active, recently improved profiles)
     + 0.07 · Verification    (ID ✓, Family ✓, Profession ✓)
     + 0.05 · Completeness    (profile strength)
     − Penalties              (recent risk signals, chronic ghosting, already overexposed)
```

### 3.1 P_mutual
- V1: logistic model on features: B's historical interest rate toward profiles like A (by compatibility bucket, age gap, distance bucket, intention), B's activity recency.
- V2: gradient-boosted model trained on (impression → mutual match → conversation depth ≥ 5 topics) outcomes.
- **Fairness constraint:** features exclude photo embeddings and any appearance signals; audited monthly for disparate impact across nationality, skin-tone proxies (via photo audit sample), marital status and age.

### 3.2 Learning from feedback
- "Not for me" reasons adjust A's soft weights (e.g. repeated "Location" passes → increase Location weight by 10%, capped). The AI Matchmaker asks for confirmation before turning a pattern into a dealbreaker.
- Interests on profiles with specific Discuss flags reduce those flags' penalty for that user.

---

## 4. Discover feed & Top Picks

### 4.1 Feed model
- **Infinite, cursor-paginated** feed. The client requests pages of 20 cards; the server returns cards + an opaque cursor.
- A **candidate queue** per user (top ~500 eligible candidates by `rank`) is precomputed in Redis and refreshed when it drops below 100 entries, when preferences change, or every 6 h. Beyond the queue, the next tier is generated on demand (paged SQL pre-filter → scoring).
- **Real-time re-ranking:** each interest/pass updates the user's soft weights (§3.2) and re-sorts the remaining queue before the next page.
- Already-seen cards (impressions) aren't repeated in the same session; passed profiles are excluded for 90 days; profiles viewed but not acted on can resurface after 7 days.

### 4.2 Page composition (per page of 20)
- ~70% top-ranked by `rank` (continuing down the queue)
- **Pinned first:** anyone who sent the user Serious Interest (immediately, if eligible)
- ~10% **inbound interest**: people who already expressed Interest (raises match yield)
- ~10% **new members** who joined since the user's last session (Freshness, plus the "New since your last visit" counter)
- ~10% **exploration**: high Overall but outside the user's usual pattern (different city with relocation fit, slightly wider age), labelled *"A little different, but highly compatible"*
- Inline cards (question, reveal, event, upsell): max 1 per 12 profiles, never adjacent.

### 4.3 Top Picks (daily)
- Free 3 · Plus 6 · Gold 10 + 1 Curated Pick · bonuses (welcome back, monthly question milestone).
- Selected nightly per user: highest mutual Overall × P_mutual, ID-verified, Strong+ profile strength, not already seen in the feed in the last 14 days. Built in a batch job 2 h before each timezone's refresh time.
- Top Picks are excluded from the feed that day to avoid duplicates.

### 4.4 Diversity rules
Within any 10 consecutive cards: no more than 4 from the same area when the scope is wide; no near-duplicate profiles (same profession and area) back-to-back.

### 4.5 Exposure fairness & inbound load balancing (critical for an infinite feed)
An infinite feed concentrates attention on the most-viewed profiles unless it is paced. Without pacing, women are flooded with interest and stop replying, men get no matches, and both churn.
- **Impression pacing:** a real-time Redis counter per profile. After a soft cap `C` impressions per day (e.g. 150, scaled by response capacity: fewer if they have many unanswered inbound interests), the profile's rank is progressively demoted (not removed) for the rest of the day.
- **Inbound pacing:** if a profile has > N pending unanswered interests (e.g. 30), it's demoted further until they catch up; their inbound list is sorted by compatibility so the best interests aren't buried.
- **Floor:** every active, complete, verified profile is guaranteed a minimum of `F` impressions per day (e.g. 25) when eligible viewers exist, via a boost to under-exposed profiles in the ranking.

### 4.6 Quality floor & tiers
- **Strong matches:** display % ≥ market floor (default **65%**). Shown first.
- **Broader matches:** below the floor, shown only after a divider and labelled as such. Dealbreakers and the other person's preferences are **never** relaxed, only soft scores.
- **Pool exhausted:** an end-of-feed state with suggestions (widen distance, relax an "Important" item, explore another country with Passport, showing honest live counts). Show it honestly; never pad with ineligible or fake profiles.

### 4.7 Pseudocode

```python
def feed_page(user, cursor, page_size=20):
    queue = candidate_queue(user)                       # Redis, precomputed top ~500 by rank
    if len(queue) < 100:
        refill_async(user)                              # next tier: SQL pre-filter → score → rank

    seen = session_impressions(user, cursor)
    pinned  = [c for c in serious_interest_senders(user) if c not in seen]
    inbound = take(inbound_interest(user), k=2, exclude=seen)
    fresh   = take(new_members_since(user.last_session), k=2, exclude=seen)
    explore = take(exploration_candidates(user), k=2, exclude=seen)
    core    = take(queue, k=page_size, exclude=seen)

    page = interleave(pinned, core, inbound, fresh, explore, size=page_size)
    page = apply_diversity(page)
    page = apply_exposure_pacing(page)                  # demote over-exposed / over-loaded profiles
    page = insert_tier_divider(page, floor=QUALITY_FLOOR[user.market])
    page = insert_inline_cards(page, every=12)          # question / reveal / event / upsell
    record_impressions(user, page)
    return [with_explanation(user, c) for c in page], next_cursor(page)
```

---

## 5. Cold start

- **New user:** compatibility runs on onboarding answers (≥ the 10 starter questions + religious + life plan); P_mutual uses population priors; a Freshness boost for the first 7 days ensures they get matches early. *First-week success drives retention.*
- **New market/city:** Growing-status countries use regional pools automatically (06 §1); in a thin pool users reach the end of the feed quickly, so lean on Top Picks, the honest end-of-pool state and "new members joined" notifications; seed the pool via events and community partners before opening the app publicly.
- **Gender imbalance:** if one side is scarce, raise their quality floor and impression caps to protect their experience, and run targeted acquisition for the scarce side.

---

## 6. Topic coverage (conversations)

The 15 core topics, each mapped to a question key:

1. Children (want / how many / when)
2. Living arrangement
3. Location & relocation
4. Religious practice at home
5. Children's religious education & schooling
6. Spouses working
7. Household responsibilities
8. Finances (joint/separate, saving/spending, debt)
9. Parents' involvement
10. Family visits & boundaries
11. Career ambitions
12. Marriage timeline & wedding expectations
13. Conflict resolution style
14. Lifestyle (social life, travel, hobbies)
15. Health & wellbeing disclosures *(opt-in, sensitive)*

A topic counts as **covered** when both answered its topic card in chat **or** the AI classifier (V2) detects that both meaningfully discussed it in free text and both users confirm with a tap ("Mark as discussed ✓"). Stage gates use coverage:

| Stage | Suggested entry condition |
|---|---|
| 2 Values | ≥ 5 messages each |
| 3 Expectations | ≥ 4 topics |
| 4 Serious discussion | ≥ 8 topics |
| 5 Family introduction | ≥ 12 topics + both "Ready" (+ guardian approval if Mode 3) |
| 6 Meeting | Families introduced or both opt to proceed privately; both ID verified |

---

## 7. Algorithm governance

- Versioned (`algo_version` stored with every score); A/B tests run via a feature-flag service with holdouts.
- Monthly fairness audit and a quarterly Shariah Advisory Board review of the explanation copy and of any religious-preference handling.
- Users can always see **"Why am I seeing this introduction?"** and adjust preferences directly from that screen.
