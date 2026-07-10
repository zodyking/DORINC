-- Seed default catalog categories (idempotent — skip names that already exist).
INSERT INTO catalog_categories (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('Lighting', 1),
  ('Electrical', 2),
  ('Battery & Charging', 3),
  ('Starting System', 4),
  ('Engine', 5),
  ('Fuel System', 6),
  ('Cooling System', 7),
  ('Air Intake', 8),
  ('Exhaust', 9),
  ('Transmission', 10),
  ('Driveline', 11),
  ('Suspension', 12),
  ('Steering', 13),
  ('Brakes', 14),
  ('Wheels & Tires', 15),
  ('HVAC', 16),
  ('Hydraulic', 17),
  ('Air System', 18),
  ('Trailer Components', 19),
  ('Body & Exterior', 20),
  ('Interior', 21),
  ('Safety Equipment', 22),
  ('Fluids & Chemicals', 23),
  ('Fasteners & Hardware', 24),
  ('Shop Supplies', 25),
  ('Accessories', 26)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_categories c WHERE lower(c.name) = lower(v.name)
);
