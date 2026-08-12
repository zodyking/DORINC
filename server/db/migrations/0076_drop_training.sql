-- Remove training feature tables and permission keys.
DROP TABLE IF EXISTS "training_lesson_progress";
DROP TABLE IF EXISTS "training_assignments";
DROP TABLE IF EXISTS "training_lessons";
DROP TABLE IF EXISTS "training_modules";

DELETE FROM "permissions" WHERE "key" IN (
  'training.read.all',
  'training.manage.all',
  'training.complete.own'
);
