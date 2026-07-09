ALTER TABLE "new_vehicle_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD COLUMN "result_vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "result_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD COLUMN "result_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "new_vehicle_requests" ADD CONSTRAINT "new_vehicle_requests_result_vehicle_id_vehicles_id_fk" FOREIGN KEY ("result_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_result_invoice_id_invoices_id_fk" FOREIGN KEY ("result_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_change_requests" ADD CONSTRAINT "invoice_change_requests_result_invoice_id_invoices_id_fk" FOREIGN KEY ("result_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_change_requests" ADD CONSTRAINT "vehicle_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_general_requests" ADD CONSTRAINT "portal_general_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
