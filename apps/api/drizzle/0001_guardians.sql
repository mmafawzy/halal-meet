CREATE TABLE "guardian_opinions" (
	"guardianship_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"opinion" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_opinions_guardianship_id_subject_id_pk" PRIMARY KEY("guardianship_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "guardianships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"guardian_id" uuid,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"permissions" jsonb NOT NULL,
	"invite_token_hash" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"verified_family" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_opinions" ADD CONSTRAINT "guardian_opinions_guardianship_id_guardianships_id_fk" FOREIGN KEY ("guardianship_id") REFERENCES "public"."guardianships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_opinions" ADD CONSTRAINT "guardian_opinions_subject_id_accounts_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_member_id_accounts_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_guardian_id_accounts_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardianships_member_idx" ON "guardianships" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "guardianships_guardian_idx" ON "guardianships" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardianships_token_uq" ON "guardianships" USING btree ("invite_token_hash");