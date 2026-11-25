CREATE TABLE "guardian_shares" (
	"member_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_shares_member_id_subject_id_pk" PRIMARY KEY("member_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "stage_approvals" (
	"match_id" uuid NOT NULL,
	"guardianship_id" uuid NOT NULL,
	"stage" smallint NOT NULL,
	"decision" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_approvals_match_id_guardianship_id_stage_pk" PRIMARY KEY("match_id","guardianship_id","stage")
);
--> statement-breakpoint
ALTER TABLE "guardian_shares" ADD CONSTRAINT "guardian_shares_member_id_accounts_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_shares" ADD CONSTRAINT "guardian_shares_subject_id_accounts_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_approvals" ADD CONSTRAINT "stage_approvals_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_approvals" ADD CONSTRAINT "stage_approvals_guardianship_id_guardianships_id_fk" FOREIGN KEY ("guardianship_id") REFERENCES "public"."guardianships"("id") ON DELETE cascade ON UPDATE no action;