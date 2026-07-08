CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"default_price" text,
	"cost" text,
	"markup_percent" text,
	"taxable" boolean DEFAULT true NOT NULL,
	"uom" text DEFAULT 'each' NOT NULL,
	"vendor" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog_labor_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid,
	"name" text NOT NULL,
	"sku" text,
	"description" text,
	"category_id" uuid,
	"rate" text NOT NULL,
	"uom" text DEFAULT 'hr' NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_labor_rates" ADD CONSTRAINT "catalog_labor_rates_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_labor_rates" ADD CONSTRAINT "catalog_labor_rates_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_labor_rates" ADD CONSTRAINT "catalog_labor_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_categories_name_idx" ON "catalog_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "catalog_items_type_idx" ON "catalog_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "catalog_items_category_idx" ON "catalog_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "catalog_items_name_idx" ON "catalog_items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "catalog_items_sku_idx" ON "catalog_items" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "catalog_labor_rates_item_idx" ON "catalog_labor_rates" USING btree ("catalog_item_id");