-- ============================================================
-- MANUAL PAYMENT VERIFICATION SYSTEM - DATABASE MIGRATION
-- ============================================================
-- Run this manually in your MySQL database.
--
-- Creates:
--   2 new tables: owner_payment_configs, tenant_payment_submissions
--   3 new enums: owner_payment_config_scope_type,
--                tenant_payment_submission_status,
--                tenant_payment_submission_method
--   Adds 'UPI' to existing rent_payments_payment_method enum
--
-- IMPORTANT: Run each section one by one and verify before
-- moving to the next. Check output after each ALTER/CREATE.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: Add 'UPI' to existing rent_payments_payment_method
-- ────────────────────────────────────────────────────────────

-- First, check current enum values
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'rent_payments' AND COLUMN_NAME = 'payment_method';

ALTER TABLE `rent_payments`
  MODIFY COLUMN `payment_method` ENUM('GPAY','PHONEPE','CASH','BANK_TRANSFER','UPI')
  NOT NULL;

-- Verify
-- SHOW COLUMNS FROM rent_payments LIKE 'payment_method';


-- ────────────────────────────────────────────────────────────
-- SECTION 2: Create owner_payment_configs table
-- ────────────────────────────────────────────────────────────
-- Stores PG owner's UPI ID, QR code, and payment instructions.
-- Can be scoped to ALL PGs (per organization) or a SPECIFIC PG.

CREATE TABLE `owner_payment_configs` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `organization_id` INT NOT NULL,
  `owner_user_id` INT NOT NULL,
  `scope_type` ENUM('ALL_PG','SPECIFIC_PG') NOT NULL,
  `pg_id` INT NULL DEFAULT NULL,
  `upi_id` VARCHAR(100) NOT NULL,
  `upi_qr_image_url` VARCHAR(500) NULL DEFAULT NULL,
  `account_holder_name` VARCHAR(100) NULL DEFAULT NULL,
  `bank_name` VARCHAR(100) NULL DEFAULT NULL,
  `account_number` VARCHAR(50) NULL DEFAULT NULL,
  `ifsc_code` VARCHAR(20) NULL DEFAULT NULL,
  `payment_instructions` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uq_org_scope_pg` (`organization_id`, `scope_type`, `pg_id`),
  INDEX `idx_opc_organization` (`organization_id`),
  INDEX `idx_opc_owner` (`owner_user_id`),
  INDEX `idx_opc_pg` (`pg_id`),
  INDEX `idx_opc_active` (`is_active`),
  CONSTRAINT `fk_opc_organization` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_opc_owner_user` FOREIGN KEY (`owner_user_id`)
    REFERENCES `users` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_opc_pg` FOREIGN KEY (`pg_id`)
    REFERENCES `pg_locations` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify
-- DESCRIBE owner_payment_configs;


-- ────────────────────────────────────────────────────────────
-- SECTION 3: Create tenant_payment_submissions table
-- ────────────────────────────────────────────────────────────
-- When a tenant pays externally (via UPI) and clicks "I Paid",
-- a record is created here with their payment proof.
-- The PG owner then verifies or rejects it.
-- When verified, the linked rent_payment.status is set to PAID.

CREATE TABLE `tenant_payment_submissions` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `rent_payment_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `pg_id` INT NOT NULL,
  `organization_id` INT NOT NULL,

  -- What the tenant claims they paid
  `paid_amount` DECIMAL(10, 2) NOT NULL,
  `paid_date` DATE NOT NULL,
  `transaction_ref` VARCHAR(100) NULL DEFAULT NULL,
  `payment_method` ENUM('UPI','GPAY','PHONEPE','CASH','BANK_TRANSFER','OTHER')
    NOT NULL DEFAULT 'UPI',
  `payment_screenshot_url` VARCHAR(500) NULL DEFAULT NULL,
  `tenant_notes` TEXT NULL,

  -- Snapshot of owner's payment config at submission time
  -- (immutable — survives owner config changes later)
  `payment_config_snapshot` JSON NULL,

  -- Verification state
  `status` ENUM('SUBMITTED','VERIFIED','REJECTED')
    NOT NULL DEFAULT 'SUBMITTED',
  `verified_by` INT NULL DEFAULT NULL,
  `verified_at` TIMESTAMP NULL DEFAULT NULL,
  `rejection_reason` TEXT NULL,

  -- Timestamps
  `submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`s_no`),
  INDEX `idx_tps_rent_payment` (`rent_payment_id`),
  INDEX `idx_tps_tenant` (`tenant_id`),
  INDEX `idx_tps_pg` (`pg_id`),
  INDEX `idx_tps_organization` (`organization_id`),
  INDEX `idx_tps_status` (`status`),
  INDEX `idx_tps_verified_by` (`verified_by`),
  INDEX `idx_tps_tenant_status` (`tenant_id`, `status`),
  INDEX `idx_tps_pg_status` (`pg_id`, `status`),
  CONSTRAINT `fk_tps_rent_payment` FOREIGN KEY (`rent_payment_id`)
    REFERENCES `rent_payments` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_tps_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_tps_pg` FOREIGN KEY (`pg_id`)
    REFERENCES `pg_locations` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_tps_organization` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`s_no`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_tps_verified_by` FOREIGN KEY (`verified_by`)
    REFERENCES `users` (`s_no`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify
-- DESCRIBE tenant_payment_submissions;


-- ────────────────────────────────────────────────────────────
-- SECTION 4: Add submission_id reference to rent_payments
-- ────────────────────────────────────────────────────────────
-- Optional: link rent_payment to its active submission.
-- This makes it easy to check if a pending payment has a
-- submission in progress without a JOIN every time.

ALTER TABLE `rent_payments`
  ADD COLUMN `active_submission_id` INT NULL DEFAULT NULL AFTER `voided_reason`;

-- Add FK (do this after confirming the column was added)
ALTER TABLE `rent_payments`
  ADD CONSTRAINT `fk_rent_payment_submission` FOREIGN KEY (`active_submission_id`)
    REFERENCES `tenant_payment_submissions` (`s_no`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- Verify
-- SHOW COLUMNS FROM rent_payments LIKE 'active_submission_id';


-- ============================================================
-- VERIFICATION QUERIES (run after all sections to confirm)
-- ============================================================
-- DESCRIBE owner_payment_configs;
-- DESCRIBE tenant_payment_submissions;
-- SHOW COLUMNS FROM rent_payments LIKE 'payment_method';
-- SHOW COLUMNS FROM rent_payments LIKE 'active_submission_id';
--
-- -- Check enum values are correct:
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'rent_payments' AND COLUMN_NAME = 'payment_method';
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'tenant_payment_submissions' AND COLUMN_NAME = 'status';
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'tenant_payment_submissions' AND COLUMN_NAME = 'payment_method';
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_NAME = 'owner_payment_configs' AND COLUMN_NAME = 'scope_type';
