CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_active_at" timestamp with time zone,
	"last_feed_visit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"account_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"self_value" jsonb,
	"partner_accept" jsonb,
	"importance" text DEFAULT 'flexible' NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_account_id_question_key_pk" PRIMARY KEY("account_id","question_key")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "country_status_overrides" (
	"code" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_impressions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"viewer_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"slot" text NOT NULL,
	"rank_score" real,
	"display_pct" smallint,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"level" text NOT NULL,
	"note" text,
	"abym_answers" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_preferences" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"age_min" smallint NOT NULL,
	"age_max" smallint NOT NULL,
	"marital_statuses" text[],
	"accept_children" boolean DEFAULT true NOT NULL,
	"verified_only" boolean DEFAULT false NOT NULL,
	"languages" text[],
	"dimension_importance" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"stage" smallint DEFAULT 1 NOT NULL,
	"journey_status" text DEFAULT 'active' NOT NULL,
	"closed_by" uuid,
	"close_reason" text,
	"first_message_due" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"topic_key" text,
	"risk" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"reason" text,
	"undone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passes_from_id_to_id_pk" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE "passport_destinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"is_worldwide" boolean DEFAULT false NOT NULL,
	"purpose" text NOT NULL,
	"visit_from" date,
	"visit_to" date,
	"visible_from" timestamp with time zone NOT NULL,
	"active_until" timestamp with time zone,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"gender" text NOT NULL,
	"birth_date" date NOT NULL,
	"nationality" text[] NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"languages" text[] NOT NULL,
	"height_cm" smallint,
	"marital_status" text NOT NULL,
	"has_children" boolean DEFAULT false NOT NULL,
	"education_level" text,
	"profession" text,
	"intention" text NOT NULL,
	"halal_mode" text NOT NULL,
	"accepted_modes" text[] NOT NULL,
	"about_me" text,
	"photo_url" text,
	"photo_visibility" text DEFAULT 'matches' NOT NULL,
	"open_to_relocate" boolean DEFAULT false NOT NULL,
	"relocate_countries" text[] DEFAULT '{}' NOT NULL,
	"intl_visibility" text DEFAULT 'on' NOT NULL,
	"profile_strength" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"store" text NOT NULL,
	"store_ref" text,
	"amount_minor" integer,
	"currency" text,
	"status" text NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"evidence_message_ids" uuid[],
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_readiness" (
	"match_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"stage" smallint NOT NULL,
	"ready_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_readiness_match_id_account_id_stage_pk" PRIMARY KEY("match_id","account_id","stage")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"store" text NOT NULL,
	"store_ref" text,
	"status" text NOT NULL,
	"period" text,
	"current_period_end" timestamp with time zone NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "top_picks" (
	"account_id" uuid NOT NULL,
	"pick_date" date NOT NULL,
	"candidate_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"source" text DEFAULT 'algo' NOT NULL,
	CONSTRAINT "top_picks_account_id_pick_date_candidate_id_pk" PRIMARY KEY("account_id","pick_date","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "topic_answers" (
	"message_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"value" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_answers_message_id_account_id_pk" PRIMARY KEY("message_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "topic_coverage" (
	"match_id" uuid NOT NULL,
	"topic_key" text NOT NULL,
	"differs" boolean DEFAULT false NOT NULL,
	"covered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_coverage_match_id_topic_key_pk" PRIMARY KEY("match_id","topic_key")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"vendor" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_from_id_accounts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_to_id_accounts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_preferences" ADD CONSTRAINT "match_preferences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_a_id_accounts_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_b_id_accounts_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_destinations" ADD CONSTRAINT "passport_destinations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_readiness" ADD CONSTRAINT "stage_readiness_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_picks" ADD CONSTRAINT "top_picks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_picks" ADD CONSTRAINT "top_picks_candidate_id_accounts_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_answers" ADD CONSTRAINT "topic_answers_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_coverage" ADD CONSTRAINT "topic_coverage_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impressions_candidate_idx" ON "feed_impressions" USING btree ("candidate_id","shown_at");--> statement-breakpoint
CREATE INDEX "impressions_viewer_idx" ON "feed_impressions" USING btree ("viewer_id","shown_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interests_pair_uq" ON "interests" USING btree ("from_id","to_id");--> statement-breakpoint
CREATE INDEX "interests_to_idx" ON "interests" USING btree ("to_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_uq" ON "matches" USING btree ("a_id","b_id");--> statement-breakpoint
CREATE INDEX "matches_b_idx" ON "matches" USING btree ("b_id");--> statement-breakpoint
CREATE INDEX "messages_match_idx" ON "messages" USING btree ("match_id","sent_at");--> statement-breakpoint
CREATE INDEX "passport_country_idx" ON "passport_destinations" USING btree ("country","status","visible_from");--> statement-breakpoint
CREATE INDEX "passport_account_idx" ON "passport_destinations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "profiles_gender_country_idx" ON "profiles" USING btree ("gender","country");--> statement-breakpoint
CREATE INDEX "purchases_account_idx" ON "purchases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_account_idx" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "usage_events_idx" ON "usage_events" USING btree ("account_id","kind","at");--> statement-breakpoint
CREATE INDEX "verifications_account_idx" ON "verifications" USING btree ("account_id");