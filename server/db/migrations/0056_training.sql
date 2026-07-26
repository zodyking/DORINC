CREATE TABLE IF NOT EXISTS "training_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "icon" text DEFAULT 'book' NOT NULL,
  "estimated_minutes" integer DEFAULT 10 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_published" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_modules_slug_unique" UNIQUE("slug")
);

CREATE INDEX IF NOT EXISTS "training_modules_published_idx" ON "training_modules" ("is_published");
CREATE INDEX IF NOT EXISTS "training_modules_sort_idx" ON "training_modules" ("sort_order");

CREATE TABLE IF NOT EXISTS "training_lessons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "module_id" uuid NOT NULL REFERENCES "training_modules"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_lessons_module_slug_idx" ON "training_lessons" ("module_id", "slug");
CREATE INDEX IF NOT EXISTS "training_lessons_module_sort_idx" ON "training_lessons" ("module_id", "sort_order");

CREATE TABLE IF NOT EXISTS "training_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "module_id" uuid NOT NULL REFERENCES "training_modules"("id") ON DELETE cascade,
  "assigned_by" uuid REFERENCES "users"("id"),
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "status" text DEFAULT 'assigned' NOT NULL,
  "locks_access" boolean DEFAULT true NOT NULL,
  "notes" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_assignments_user_module_idx" ON "training_assignments" ("user_id", "module_id");
CREATE INDEX IF NOT EXISTS "training_assignments_user_status_idx" ON "training_assignments" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "training_assignments_module_idx" ON "training_assignments" ("module_id");

CREATE TABLE IF NOT EXISTS "training_lesson_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL REFERENCES "training_assignments"("id") ON DELETE cascade,
  "lesson_id" uuid NOT NULL REFERENCES "training_lessons"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "step_index" integer DEFAULT 0 NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_lesson_progress_assignment_lesson_idx" ON "training_lesson_progress" ("assignment_id", "lesson_id");
CREATE INDEX IF NOT EXISTS "training_lesson_progress_user_idx" ON "training_lesson_progress" ("user_id");
