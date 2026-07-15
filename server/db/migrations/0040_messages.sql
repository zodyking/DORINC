CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text DEFAULT 'dm' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "edited_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "message_entity_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "entity_label" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_sender_user_id_users_id_fk"
  FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "message_entity_refs"
  ADD CONSTRAINT "message_entity_refs_message_id_messages_id_fk"
  FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_unique"
  ON "conversation_participants" USING btree ("conversation_id","user_id");

CREATE INDEX IF NOT EXISTS "conversation_participants_user_idx"
  ON "conversation_participants" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "conversations_updated_idx"
  ON "conversations" USING btree ("updated_at");

CREATE INDEX IF NOT EXISTS "messages_conversation_idx"
  ON "messages" USING btree ("conversation_id","created_at");

CREATE INDEX IF NOT EXISTS "messages_sender_idx"
  ON "messages" USING btree ("sender_user_id");

CREATE INDEX IF NOT EXISTS "message_entity_refs_message_idx"
  ON "message_entity_refs" USING btree ("message_id");

CREATE INDEX IF NOT EXISTS "message_entity_refs_entity_idx"
  ON "message_entity_refs" USING btree ("entity_type","entity_id");
