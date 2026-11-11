CREATE TABLE "wb_orders" (
	"cabinet_id" text NOT NULL,
	"srid" text NOT NULL,
	"day" date NOT NULL,
	"ordered_at" timestamp NOT NULL,
	"last_change_at" timestamp NOT NULL,
	"nm_id" integer NOT NULL,
	"tech_size" text DEFAULT '' NOT NULL,
	"warehouse_type" text DEFAULT '' NOT NULL,
	"price_with_disc" real DEFAULT 0 NOT NULL,
	"finished_price" real DEFAULT 0 NOT NULL,
	"spp" real DEFAULT 0 NOT NULL,
	"is_cancel" boolean DEFAULT false NOT NULL,
	"cancel_day" date,
	CONSTRAINT "wb_orders_cabinet_id_srid_pk" PRIMARY KEY("cabinet_id","srid")
);
--> statement-breakpoint
CREATE TABLE "wb_products" (
	"cabinet_id" text NOT NULL,
	"nm_id" integer NOT NULL,
	"imt_id" integer,
	"vendor_code" text NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"photo_url" text,
	"barcodes" text[] DEFAULT '{}' NOT NULL,
	"card_updated_at" timestamp with time zone,
	"price" real,
	"discounted_price" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wb_products_cabinet_id_nm_id_pk" PRIMARY KEY("cabinet_id","nm_id")
);
--> statement-breakpoint
CREATE TABLE "wb_sales" (
	"cabinet_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"srid" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"sold_at" timestamp NOT NULL,
	"last_change_at" timestamp NOT NULL,
	"nm_id" integer NOT NULL,
	"tech_size" text DEFAULT '' NOT NULL,
	"price_with_disc" real DEFAULT 0 NOT NULL,
	"for_pay" real DEFAULT 0 NOT NULL,
	"is_return" boolean DEFAULT false NOT NULL,
	CONSTRAINT "wb_sales_cabinet_id_sale_id_pk" PRIMARY KEY("cabinet_id","sale_id")
);
--> statement-breakpoint
CREATE TABLE "wb_stocks" (
	"cabinet_id" text NOT NULL,
	"nm_id" integer NOT NULL,
	"fbo" integer DEFAULT 0 NOT NULL,
	"fbs" integer,
	"to_client" integer DEFAULT 0 NOT NULL,
	"from_client" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wb_stocks_cabinet_id_nm_id_pk" PRIMARY KEY("cabinet_id","nm_id")
);
--> statement-breakpoint
ALTER TABLE "wb_orders" ADD CONSTRAINT "wb_orders_cabinet_id_cabinets_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_products" ADD CONSTRAINT "wb_products_cabinet_id_cabinets_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_sales" ADD CONSTRAINT "wb_sales_cabinet_id_cabinets_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_stocks" ADD CONSTRAINT "wb_stocks_cabinet_id_cabinets_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wb_orders_day" ON "wb_orders" USING btree ("cabinet_id","day","nm_id");--> statement-breakpoint
CREATE INDEX "wb_orders_cancel" ON "wb_orders" USING btree ("cabinet_id","cancel_day");--> statement-breakpoint
CREATE INDEX "wb_sales_day" ON "wb_sales" USING btree ("cabinet_id","day","nm_id");