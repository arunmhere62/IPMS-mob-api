-- ================================================
-- NOTIFICATION SYSTEM TABLES
-- ================================================
-- Run this SQL to create notification tables
-- ================================================

-- 1. User FCM Tokens Table
-- Stores device tokens for push notifications
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  s_no SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(s_no) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type VARCHAR(20),
  device_id TEXT,
  device_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_id ON user_fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_active ON user_fcm_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_token ON user_fcm_tokens(fcm_token);

-- 2. Notifications Table
-- Stores notification history
CREATE TABLE IF NOT EXISTS notifications (
  s_no SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(s_no) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50),
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- 3. Notification Settings Table
-- User preferences for notifications
CREATE TABLE IF NOT EXISTS notification_settings (
  s_no SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(s_no) ON DELETE CASCADE,
  rent_reminders BOOLEAN DEFAULT true,
  payment_confirmations BOOLEAN DEFAULT true,
  tenant_alerts BOOLEAN DEFAULT true,
  maintenance_alerts BOOLEAN DEFAULT true,
  general_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- ================================================
-- COMMENTS
-- ================================================

COMMENT ON TABLE user_fcm_tokens IS 'Stores Firebase Cloud Messaging tokens for push notifications';
COMMENT ON COLUMN user_fcm_tokens.fcm_token IS 'Unique FCM token for the device';
COMMENT ON COLUMN user_fcm_tokens.device_type IS 'Device platform (ios, android, web)';
COMMENT ON COLUMN user_fcm_tokens.is_active IS 'Whether the token is still valid';

COMMENT ON TABLE notifications IS 'Notification history for all users';
COMMENT ON COLUMN notifications.type IS 'Notification type (RENT_REMINDER, OVERDUE_ALERT, etc.)';
COMMENT ON COLUMN notifications.data IS 'Additional data payload in JSON format';

COMMENT ON TABLE notification_settings IS 'User preferences for different notification types';

-- ================================================
-- SAMPLE DATA (Optional - for testing)
-- ================================================

-- Insert default notification settings for existing users
-- INSERT INTO notification_settings (user_id)
-- SELECT s_no FROM users 
-- WHERE s_no NOT IN (SELECT user_id FROM notification_settings);

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- Check if tables were created
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('user_fcm_tokens', 'notifications', 'notification_settings')
ORDER BY table_name;

-- Show table structures
\d user_fcm_tokens
\d notifications
\d notification_settings
