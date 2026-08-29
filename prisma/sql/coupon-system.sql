-- ============================================================
-- COUPON SYSTEM - DATABASE MIGRATION
-- ============================================================
-- Run this manually in your MySQL database.
-- Creates 2 new tables, 1 enum, and adds columns to existing tables.
-- ============================================================

-- 1. Create the discount_type enum
CREATE TYPE enum_coupon_discount_type AS ENUM ('PERCENTAGE', 'FLAT_AMOUNT');
-- Note: If your MySQL doesn't support CREATE TYPE (MySQL < 8.0),
-- use ENUM inline in the table definition instead (already done below).

-- 2. Create coupons table
CREATE TABLE `coupons` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL,
  `description` TEXT NULL,
  `discount_type` ENUM('PERCENTAGE', 'FLAT_AMOUNT') NOT NULL,
  `discount_value` DECIMAL(10, 2) NOT NULL,
  `max_discount_amount` DECIMAL(10, 2) NULL DEFAULT NULL,
  `min_order_amount` DECIMAL(10, 2) NULL DEFAULT 0.00,
  `max_uses` INT NULL DEFAULT NULL,
  `max_uses_per_user` INT NULL DEFAULT 1,
  `used_count` INT NOT NULL DEFAULT 0,
  `applicable_plan_ids` JSON NULL,
  `valid_from` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `valid_until` TIMESTAMP NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  UNIQUE KEY `uk_coupon_code` (`code`),
  INDEX `idx_coupon_active` (`is_active`),
  INDEX `idx_coupon_valid_until` (`valid_until`),
  INDEX `idx_coupon_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create coupon_redemptions table (audit trail)
CREATE TABLE `coupon_redemptions` (
  `s_no` INT NOT NULL AUTO_INCREMENT,
  `coupon_id` INT NOT NULL,
  `subscription_payment_id` INT NULL,
  `user_id` INT NOT NULL,
  `organization_id` INT NOT NULL,
  `plan_id` INT NOT NULL,
  `original_amount` DECIMAL(10, 2) NOT NULL,
  `discount_amount` DECIMAL(10, 2) NOT NULL,
  `final_amount` DECIMAL(10, 2) NOT NULL,
  `coupon_code` VARCHAR(50) NOT NULL,
  `redeemed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`s_no`),
  INDEX `idx_redemption_coupon` (`coupon_id`),
  INDEX `idx_redemption_payment` (`subscription_payment_id`),
  INDEX `idx_redemption_user` (`user_id`),
  INDEX `idx_redemption_org` (`organization_id`),
  INDEX `idx_redemption_user_coupon` (`user_id`, `coupon_id`),
  CONSTRAINT `fk_redemption_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`s_no`) ON DELETE CASCADE,
  CONSTRAINT `fk_redemption_payment` FOREIGN KEY (`subscription_payment_id`) REFERENCES `subscription_payments` (`s_no`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Add coupon columns to subscription_payments (track which coupon was used per payment)
ALTER TABLE `subscription_payments`
  ADD COLUMN `coupon_id` INT NULL DEFAULT NULL AFTER `plan_id`,
  ADD COLUMN `coupon_code` VARCHAR(50) NULL DEFAULT NULL AFTER `coupon_id`,
  ADD COLUMN `original_amount` VARCHAR(50) NULL DEFAULT NULL AFTER `coupon_code`,
  ADD COLUMN `discount_amount` VARCHAR(50) NULL DEFAULT '0.00' AFTER `original_amount`;

-- 5. Add coupon + discount columns to subscription_invoices (show discount on invoice)
ALTER TABLE `subscription_invoices`
  ADD COLUMN `coupon_code` VARCHAR(50) NULL DEFAULT NULL AFTER `gst_number`,
  ADD COLUMN `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `coupon_code`,
  ADD COLUMN `original_taxable_value` DECIMAL(10, 2) NULL DEFAULT NULL AFTER `discount_amount`;

-- 6. Add foreign key from subscription_payments to coupons (optional, do after data is stable)
-- ALTER TABLE `subscription_payments`
--   ADD CONSTRAINT `fk_subscription_payment_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`s_no`) ON DELETE SET NULL;

-- ============================================================
-- VERIFICATION QUERIES (run after to confirm)
-- ============================================================
-- DESCRIBE coupons;
-- DESCRIBE coupon_redemptions;
-- SHOW COLUMNS FROM subscription_payments LIKE 'coupon%';
-- SHOW COLUMNS FROM subscription_invoices LIKE 'coupon%';
-- SHOW COLUMNS FROM subscription_invoices LIKE 'discount%';
