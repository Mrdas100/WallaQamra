-- تراجع يدوي عن 20261027070000_card_design (لا يمس بيانات العملاء أو الأرصدة).
DROP TABLE IF EXISTS "CardDesign";
DROP TABLE IF EXISTS "DesignAsset";
DROP TYPE IF EXISTS "DesignStage";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027070000_card_design';
