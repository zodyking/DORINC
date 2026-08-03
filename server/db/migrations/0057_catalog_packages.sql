CREATE TABLE IF NOT EXISTS "catalog_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sku" text,
  "name" text NOT NULL,
  "description" text,
  "category_id" uuid REFERENCES "catalog_categories"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "catalog_packages_name_idx" ON "catalog_packages" ("name");
CREATE INDEX IF NOT EXISTS "catalog_packages_category_idx" ON "catalog_packages" ("category_id");
CREATE INDEX IF NOT EXISTS "catalog_packages_sku_idx" ON "catalog_packages" ("sku");

CREATE TABLE IF NOT EXISTS "catalog_package_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid NOT NULL REFERENCES "catalog_packages"("id") ON DELETE cascade,
  "catalog_item_id" uuid NOT NULL REFERENCES "catalog_items"("id"),
  "quantity" text DEFAULT '1' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "catalog_package_items_package_idx" ON "catalog_package_items" ("package_id");
CREATE INDEX IF NOT EXISTS "catalog_package_items_item_idx" ON "catalog_package_items" ("catalog_item_id");
