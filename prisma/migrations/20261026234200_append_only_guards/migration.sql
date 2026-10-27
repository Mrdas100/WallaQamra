-- حماية السجلات المالية والتدقيق: إضافة فقط.
-- أي UPDATE أو DELETE أو TRUNCATE على LedgerEntry / AuditLog / Redemption يُرفض من قاعدة البيانات نفسها،
-- حتى لو جاء من كود التطبيق أو من اتصال مباشر. التصحيح يكون بحركة عكسية مع سبب.

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % on table "%" is forbidden', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entry_no_truncate
  BEFORE TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER redemption_no_update_delete
  BEFORE UPDATE OR DELETE ON "Redemption"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER redemption_no_truncate
  BEFORE TRUNCATE ON "Redemption"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- قيود إضافية على مستوى القاعدة
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_points_nonzero CHECK (points <> 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_correction_has_reason
  CHECK (type NOT IN ('MANUAL_ADJUST', 'CORRECTION') OR (reason IS NOT NULL AND length(btrim(reason)) >= 3));
ALTER TABLE "Order" ADD CONSTRAINT order_amount_positive CHECK ("amountHalalas" > 0);
ALTER TABLE "Reward" ADD CONSTRAINT reward_cost_positive CHECK (cost > 0);
