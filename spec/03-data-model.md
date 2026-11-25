# 03 — Data Model

← [Back to index](README.md)

PostgreSQL 16 + PostGIS. UUID primary keys (`uuid` v7 for time ordering). All tables have `created_at`, `updated_at` (omitted below for brevity). Soft-deletes only where legally required for safety investigations; otherwise hard-delete on account deletion.

## 1. Data classification

| Class | Examples | Protection |
|---|---|---|
| **C4 — Highly sensitive** | ID documents, selfies for liveness, religious data, marital history, children info, health answers, messages, location | Field-level encryption (KMS envelope), strict RBAC, access audit, region-pinned storage |
| **C3 — Personal** | Name, DOB, phone, email, photos, profession | Encrypted at rest, RBAC |
| **C2 — Behavioural** | Interests, passes, sessions | Pseudonymised in analytics |
| **C1 — Public/aggregate** | Question texts, course content | Standard |

ID document images are held by the verification vendor. We store only the verification result, document type, country and expiry, **never the document image**, unless law requires it.

## 2. Schema (DDL, condensed)

```sql
-- ===== Identity & accounts =====
CREATE TYPE gender AS ENUM ('male','female');
CREATE TYPE account_role AS ENUM ('member','guardian','matchmaker','moderator','admin');
CREATE TYPE account_status AS ENUM ('active','paused','hidden','engaged','suspended','banned','deleted');

CREATE TABLE accounts (
  id              uuid PRIMARY KEY,
  role            account_role NOT NULL DEFAULT 'member',
  phone_e164      text UNIQUE NOT NULL,          -- encrypted, + blind index for lookup
  email           text UNIQUE,
  locale          text NOT NULL DEFAULT 'ar',    -- 'ar' | 'en'
  numeral_style   text NOT NULL DEFAULT 'western',
  hijri_dates     boolean NOT NULL DEFAULT false,
  status          account_status NOT NULL DEFAULT 'active',
  region          text NOT NULL,                 -- data residency shard: 'eg','sa','ae','eu','uk','us'
  last_active_at  timestamptz
);

CREATE TABLE consents (
  id          uuid PRIMARY KEY,
  account_id  uuid REFERENCES accounts ON DELETE CASCADE,
  kind        text NOT NULL,   -- 'terms','privacy','religious_data','marketing','guardian_access','ai_processing'
  version     text NOT NULL,
  granted     boolean NOT NULL,
  granted_at  timestamptz NOT NULL
);

-- ===== Member profile =====
CREATE TYPE marital_status AS ENUM ('never_married','divorced','widowed','annulled');
CREATE TYPE intention AS ENUM ('within_6m','within_1y','within_2y','serious_getting_to_know','unsure');
CREATE TYPE halal_mode AS ENUM ('private','guided','wali');

CREATE TABLE profiles (
  account_id        uuid PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  first_name        text NOT NULL,
  family_name       text,                       -- private
  gender            gender NOT NULL,
  birth_date        date NOT NULL,              -- C3; age derived
  nationality       text[] NOT NULL,            -- ISO-3166
  country           text NOT NULL,
  area_id           uuid REFERENCES areas,      -- neighbourhood-level, never exact coordinates
  geo               geography(Point),           -- area centroid, used for distance
  height_cm         smallint,
  marital_status    marital_status NOT NULL,
  children_count    smallint DEFAULT 0,
  children_living_with boolean,
  education_level   text,
  education_field   text,
  university        text,
  profession        text,
  industry          text,
  smoking           text,
  intention         intention NOT NULL,
  halal_mode        halal_mode NOT NULL,
  accepted_modes    halal_mode[] NOT NULL,
  about_me          text,                       -- moderated
  about_me_ai_generated boolean DEFAULT false,
  voice_intro_url   text,
  voice_visibility  text DEFAULT 'matches',
  photo_visibility  text NOT NULL DEFAULT 'matches', -- 'public','matches','request','family'
  incognito         boolean DEFAULT false,
  open_to_relocate  boolean DEFAULT false,
  relocate_countries text[],
  intl_visibility   text NOT NULL DEFAULT 'on',  -- Passport users can see me: 'on' | 'relocating_only' | 'off'
  profile_strength  smallint DEFAULT 0,         -- 0..100, cached
  respectful_responder boolean DEFAULT false
);

CREATE TABLE areas (                            -- curated, localized place names
  id uuid PRIMARY KEY, country text, city_en text, city_ar text,
  area_en text, area_ar text, centroid geography(Point)
);

CREATE TABLE profile_languages (
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  lang text, proficiency text, PRIMARY KEY (account_id, lang)
);

CREATE TABLE photos (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  storage_key text NOT NULL,
  blurred_key text NOT NULL,
  position smallint,
  visibility_override text,                     -- null = inherit profile setting
  is_verified_face boolean DEFAULT false,
  moderation_status text DEFAULT 'pending',     -- pending/approved/rejected
  ai_generated_score real,
  phash bigint                                  -- duplicate / stolen photo detection
);

CREATE TABLE photo_access_grants (
  owner_id uuid REFERENCES accounts ON DELETE CASCADE,
  viewer_id uuid REFERENCES accounts ON DELETE CASCADE,
  status text NOT NULL,                         -- requested/approved/declined/revoked
  requires_guardian boolean DEFAULT false,
  decided_at timestamptz,
  PRIMARY KEY (owner_id, viewer_id)
);

-- ===== Religious & lifestyle (C4, encrypted columns) =====
CREATE TABLE religious_profiles (
  account_id uuid PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  prayer text, fasting text, orientation text, madhhab text,
  quran text, mosque_attendance text, islamic_education text,
  is_revert boolean, hijab text, beard text,
  halal_food text, alcohol text, music text, gender_mixing text,
  field_visibility jsonb NOT NULL DEFAULT '{}'  -- {"prayer":"profile"|"matching_only"|"hidden"}
);

-- ===== Questions & answers (compatibility) =====
CREATE TABLE questions (
  id uuid PRIMARY KEY,
  key text UNIQUE NOT NULL,                     -- 'children_count', 'finance_joint'
  category text NOT NULL,                       -- marriage/religion/family/finance/children/lifestyle/...
  dimension text NOT NULL,                      -- compatibility dimension it feeds
  answer_type text NOT NULL,                    -- 'ordinal','categorical','multi','range'
  text_en text NOT NULL, text_ar_m text NOT NULL, text_ar_f text NOT NULL,
  options jsonb NOT NULL,                       -- [{value, label_en, label_ar_m, label_ar_f, ordinal}]
  is_core_topic boolean DEFAULT false,          -- one of the 15 topic-coverage topics
  sensitivity text DEFAULT 'normal',
  active boolean DEFAULT true
);

CREATE TABLE answers (
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  question_id uuid REFERENCES questions,
  self_value jsonb,                             -- my answer
  partner_accept jsonb,                         -- acceptable partner answers (null = any)
  importance text NOT NULL DEFAULT 'flexible',  -- dealbreaker/must/important/flexible
  note text,
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, question_id)
);

CREATE TABLE value_importance (
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  dimension text, importance text,
  PRIMARY KEY (account_id, dimension)
);

CREATE TABLE key_facts (                        -- "Ask Before You Match"
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  question_id uuid REFERENCES questions,
  position smallint
);

CREATE TABLE match_preferences (
  account_id uuid PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  age_min smallint, age_max smallint,
  distance_km int, scope text,                  -- 'radius','city','country' (home); other countries via passport_destinations
  countries text[],
  marital_statuses marital_status[],
  accept_children boolean,
  verified_only boolean DEFAULT false,
  languages text[],
  extra jsonb                                   -- advanced filters (Plus+)
);

-- ===== Matching =====
CREATE TABLE compatibility_scores (             -- pair cache, symmetric key (a < b)
  a_id uuid, b_id uuid,
  overall real NOT NULL,
  dims jsonb NOT NULL,                          -- {"religion":0.94,"family":0.92,...}
  reasons jsonb NOT NULL,                       -- structured reason codes
  discuss jsonb NOT NULL,                       -- structured discuss flags
  algo_version text NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (a_id, b_id)
);

-- Feed impressions: high volume, partitioned by day; aggregated nightly, raw rows kept 30 days.
-- Live per-profile impression counters and candidate queues live in Redis.
CREATE TABLE feed_impressions (
  viewer_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  session_id uuid NOT NULL,
  position int,
  slot text,                                    -- 'core','pinned_serious','inbound','new_member','explore','broader'
  rank_score real,
  display_pct smallint,
  dwell_ms int,
  action text,                                  -- null/interest/serious/pass/save/open_profile
  shown_at timestamptz NOT NULL,
  PRIMARY KEY (viewer_id, candidate_id, shown_at)
) PARTITION BY RANGE (shown_at);

CREATE TABLE top_picks (
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  pick_date date NOT NULL,
  candidate_id uuid REFERENCES accounts ON DELETE CASCADE,
  position smallint,
  source text,                                  -- 'algo','curated_ai','curated_human','bonus','extra_pack'
  viewed_at timestamptz, action text,
  PRIMARY KEY (account_id, pick_date, candidate_id)
);

-- Passport: virtual locations (active now, or scheduled via Travel mode)
CREATE TABLE passport_destinations (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  country text NOT NULL,
  area_id uuid REFERENCES areas,                -- null = whole country
  is_worldwide boolean DEFAULT false,           -- Gold only
  purpose text NOT NULL,                        -- 'relocate','moving','visiting','spouse_relocates_to_me','either'
  move_date date,
  visit_from date, visit_to date,               -- Travel mode
  visible_from timestamptz,                     -- e.g. visit_from - 14 days
  active_until timestamptz,                     -- pass expiry / trip end
  status text NOT NULL,                         -- scheduled/active/expired/cancelled
  source text NOT NULL                          -- 'pass','addon','gold','elite','plus_quarterly'
);
CREATE INDEX ON passport_destinations (country, status, visible_from);

CREATE TABLE saved_profiles (
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  candidate_id uuid REFERENCES accounts ON DELETE CASCADE,
  saved_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, candidate_id)
);

CREATE TABLE interests (
  id uuid PRIMARY KEY,
  from_id uuid REFERENCES accounts ON DELETE CASCADE,
  to_id uuid REFERENCES accounts ON DELETE CASCADE,
  level text NOT NULL,                          -- 'interest','serious'
  note text,
  abym_answers jsonb,                           -- Ask-Before-You-Match responses
  status text DEFAULT 'pending',                -- pending/matched/passed/expired
  UNIQUE (from_id, to_id)
);

CREATE TABLE passes (
  from_id uuid, to_id uuid, reason text, undone boolean DEFAULT false,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE matches (
  id uuid PRIMARY KEY,
  a_id uuid REFERENCES accounts, b_id uuid REFERENCES accounts,
  stage smallint NOT NULL DEFAULT 1,            -- 1..6
  journey_status text DEFAULT 'active',         -- active/closed/families/met/engaged
  closed_by uuid, close_reason text,
  first_message_due timestamptz,
  engaged_at timestamptz,
  UNIQUE (a_id, b_id)
);

CREATE TABLE journey_events (
  id uuid PRIMARY KEY, match_id uuid REFERENCES matches ON DELETE CASCADE,
  kind text, actor_id uuid, payload jsonb, occurred_at timestamptz
);

CREATE TABLE stage_readiness (
  match_id uuid, account_id uuid, stage smallint, ready_at timestamptz,
  approved_by_guardian uuid, PRIMARY KEY (match_id, account_id, stage)
);

-- ===== Conversations =====
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  kind text NOT NULL,                           -- 'match','family_room','guardian_private','matchmaker'
  match_id uuid REFERENCES matches ON DELETE CASCADE,
  translation_enabled boolean DEFAULT false
);

CREATE TABLE conversation_participants (
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE,
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  role text NOT NULL,                           -- 'member','guardian','matchmaker'
  can_write boolean DEFAULT true,
  joined_at timestamptz, left_at timestamptz,
  PRIMARY KEY (conversation_id, account_id)
);

CREATE TABLE messages (                         -- partitioned by month
  id uuid, conversation_id uuid, sender_id uuid,
  kind text NOT NULL,                           -- text/voice/topic_card/photo/photo_request/call/system
  body_enc bytea,                               -- encrypted
  topic_question_id uuid,
  media_key text,
  risk_score real, risk_labels text[],
  hidden boolean DEFAULT false,
  sent_at timestamptz NOT NULL,
  PRIMARY KEY (id, sent_at)
) PARTITION BY RANGE (sent_at);

CREATE TABLE topic_coverage (
  match_id uuid REFERENCES matches ON DELETE CASCADE,
  question_id uuid REFERENCES questions,
  a_answered boolean, b_answered boolean, differs boolean,
  covered_at timestamptz,
  PRIMARY KEY (match_id, question_id)
);

-- ===== Guardians & family =====
CREATE TABLE guardianships (
  id uuid PRIMARY KEY,
  member_id uuid REFERENCES accounts ON DELETE CASCADE,
  guardian_id uuid REFERENCES accounts ON DELETE CASCADE,
  relationship text NOT NULL,                   -- father/mother/brother/sister/uncle/aunt/other
  status text NOT NULL,                         -- invited/active/paused/removed
  permissions jsonb NOT NULL,                   -- see 01 §44
  invite_token_hash text, invited_at timestamptz,
  verified_family boolean DEFAULT false
);

CREATE TABLE guardian_opinions (
  guardianship_id uuid REFERENCES guardianships ON DELETE CASCADE,
  subject_id uuid REFERENCES accounts ON DELETE CASCADE,
  opinion text, note text,
  PRIMARY KEY (guardianship_id, subject_id)
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY, match_id uuid REFERENCES matches,
  kind text,                                    -- in_person/video/family_video
  place_name text, place_area_id uuid, starts_at timestamptz, ends_at timestamptz,
  status text
);

CREATE TABLE safety_checkins (
  meeting_id uuid REFERENCES meetings ON DELETE CASCADE,
  account_id uuid REFERENCES accounts,
  trusted_contact text,                         -- encrypted phone or guardian account id
  checked_in_at timestamptz, alerted_at timestamptz,
  PRIMARY KEY (meeting_id, account_id)
);

CREATE TABLE video_sessions (
  id uuid PRIMARY KEY, conversation_id uuid, provider_room text,
  mode text, started_at timestamptz, ended_at timestamptz, participants uuid[]
);

-- ===== Verification & trust =====
CREATE TABLE verifications (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  kind text NOT NULL,                           -- phone/identity/profession/education/marital/family
  status text NOT NULL,                         -- pending/approved/rejected/expired
  vendor text, vendor_ref text,
  doc_country text, doc_type text, expires_on date,
  reviewed_by uuid, decided_at timestamptz
);

CREATE TABLE risk_signals (
  id uuid PRIMARY KEY, account_id uuid,
  kind text,                                    -- money_request/offplatform_push/mass_message/dup_photo/ai_face/device_farm
  score real, evidence jsonb, created_at timestamptz
);

CREATE TABLE reports (
  id uuid PRIMARY KEY, reporter_id uuid, subject_id uuid,
  category text, details text, evidence_message_ids uuid[],
  status text DEFAULT 'open', priority smallint, assigned_to uuid, resolution text
);

CREATE TABLE blocks (blocker_id uuid, blocked_id uuid, PRIMARY KEY (blocker_id, blocked_id));

CREATE TABLE contact_hashes (                   -- "hide from my contacts"
  account_id uuid REFERENCES accounts ON DELETE CASCADE,
  phone_hash bytea, PRIMARY KEY (account_id, phone_hash)
);

CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY, target_account uuid, target_content_id uuid,
  action text, reason text, actor_id uuid, automated boolean, created_at timestamptz
);

-- ===== Monetization =====
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY, account_id uuid REFERENCES accounts,
  tier text NOT NULL,                           -- plus/gold/elite/engaged
  store text NOT NULL,                          -- apple/google/stripe/paymob/fawry
  store_ref text, status text,                  -- trialing/active/grace/paused/cancelled/expired
  period text, price_minor int, currency text,
  current_period_end timestamptz, auto_renew boolean
);

CREATE TABLE entitlements (                     -- materialised from subscriptions + purchases
  account_id uuid, key text, value jsonb, source text, expires_at timestamptz,
  PRIMARY KEY (account_id, key)
);

CREATE TABLE purchases (
  id uuid PRIMARY KEY, account_id uuid, sku text, store text, store_ref text,
  amount_minor int, currency text, status text, fulfilled_at timestamptz
);

CREATE TABLE usage_counters (                   -- rolling limits (serious interest, AI suggestions, calls)
  account_id uuid, key text, window_start timestamptz, count int,
  PRIMARY KEY (account_id, key, window_start)
);

-- ===== Engagement =====
CREATE TABLE daily_question_assignments (
  account_id uuid, assigned_date date, question_id uuid, answered_at timestamptz,
  PRIMARY KEY (account_id, assigned_date)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY, account_id uuid, category text, template text,
  payload jsonb, channel text, sent_at timestamptz, opened_at timestamptz
);

CREATE TABLE notification_prefs (
  account_id uuid PRIMARY KEY, prefs jsonb, quiet_start time, quiet_end time,
  prayer_quiet boolean DEFAULT false, top_picks_time_rule text  -- 'maghrib+30' | '20:30'
);

CREATE TABLE referrals (
  id uuid PRIMARY KEY, referrer_id uuid, referee_id uuid, channel text,
  qualified_at timestamptz, reward_granted boolean
);

-- ===== Community & ecosystem =====
CREATE TABLE events (id uuid PRIMARY KEY, city_area_id uuid, title_en text, title_ar text,
  kind text, starts_at timestamptz, capacity int, price_minor int, currency text, verified_only boolean);
CREATE TABLE event_tickets (id uuid PRIMARY KEY, event_id uuid, account_id uuid,
  status text, qr_token_hash text, checked_in_at timestamptz);
CREATE TABLE courses (id uuid PRIMARY KEY, slug text, title_en text, title_ar text,
  instructor text, price_minor int, tier_included text);
CREATE TABLE enrollments (account_id uuid, course_id uuid, progress real, completed_at timestamptz,
  PRIMARY KEY (account_id, course_id));
CREATE TABLE vendors (id uuid PRIMARY KEY, name text, category text, country text, area_id uuid,
  commission_rate real, status text);
CREATE TABLE success_stories (id uuid PRIMARY KEY, match_id uuid, consent_a boolean, consent_b boolean,
  story_en text, story_ar text, published boolean);

-- ===== Matchmaking (Elite) =====
CREATE TABLE concierge_clients (account_id uuid PRIMARY KEY, matchmaker_id uuid, plan text, brief jsonb);
CREATE TABLE matchmaker_notes (id uuid PRIMARY KEY, client_id uuid, candidate_id uuid, note text,
  shared_with_client boolean);

-- ===== Compliance =====
CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor_id uuid, actor_role text, action text,
  target_type text, target_id uuid, ip inet, at timestamptz DEFAULT now());
CREATE TABLE data_requests (id uuid PRIMARY KEY, account_id uuid, kind text,   -- export/delete
  status text, requested_at timestamptz, completed_at timestamptz, artifact_key text);
```

## 3. Key indexes

- `profiles (gender, country, intention)`, `GIST (geo)`, partial index on `status='active'` via `accounts`.
- `interests (to_id, status)`, `matches (a_id)`, `matches (b_id)`.
- `messages (conversation_id, sent_at DESC)` per partition.
- `feed_impressions (candidate_id, shown_at)` per partition, for exposure-fairness audits (live pacing uses Redis counters).
- `top_picks (account_id, pick_date)`.
- `photos (phash)` with a BK-tree / Hamming index in the matching service for near-duplicates.

## 4. Retention & deletion rules

| Data | Retention |
|---|---|
| Closed conversations | Deleted 30 days after close, unless under an active report (then 180 days, restricted access) |
| Messages of deleted accounts | Deleted immediately for the deleter; the other party sees "Message removed" |
| Verification results | Life of the account + legal minimum; vendor deletes images per contract (≤30 days) |
| Banned-user fingerprints (hashed phone/device/face template) | 3 years, to prevent ban evasion — disclosed in the privacy policy, subject to local law |
| Feed impressions (raw) | 30 days, then aggregated |
| Analytics events | Pseudonymised, 25 months |
| Audit logs | 5 years |
| Data export | Delivered within 72 h (legal max 30 days); download link expires after 7 days |
