CREATE TABLE "editing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_name_snapshot" text NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "editing_sessions" ADD CONSTRAINT "editing_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editing_sessions_entity_idx" ON "editing_sessions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "editing_sessions_user_idx" ON "editing_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "editing_sessions_active_idx" ON "editing_sessions" USING btree ("entity_type","entity_id","released_at");