-- ============================================
-- NeoClip 302 - Complete Supabase Database Schema
-- Version: 3.3.0 - Optimized for Async Video Generation
-- ============================================
-- 
-- Run this SQL in your Supabase SQL Editor to set up the database
-- This schema supports:
-- - User management with anonymous and OAuth authentication
-- - Video generation tracking with async task management
-- - Usage quotas and billing
-- - Analytics and session tracking
-- - API key rotation for multi-provider support
--
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CLEAN UP (Optional - Remove existing tables)
-- ============================================
-- Uncomment these lines if you want to drop existing tables
-- DROP TABLE IF EXISTS app_events CASCADE;
-- DROP TABLE IF EXISTS user_sessions CASCADE;
-- DROP TABLE IF EXISTS webhook_logs CASCADE;
-- DROP TABLE IF EXISTS api_keys CASCADE;
-- DROP TABLE IF EXISTS generations CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- USERS TABLE
-- Core user data with subscription and usage tracking
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT UNIQUE,
    email TEXT UNIQUE,
    
    -- Authentication
    auth_provider TEXT DEFAULT 'anonymous' CHECK (auth_provider IN ('anonymous', 'google', 'apple', 'email', 'github')),
    auth_provider_id TEXT,
    
    -- Profile data (from OAuth)
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    locale TEXT DEFAULT 'en',
    timezone TEXT,
    
    -- Account verification
    email_verified BOOLEAN DEFAULT false,
    phone TEXT,
    phone_verified BOOLEAN DEFAULT false,
    
    -- Subscription & Billing
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
    subscription_ends_at TIMESTAMPTZ,
    
    -- Usage tracking (monthly)
    free_used INTEGER DEFAULT 0 CHECK (free_used >= 0),
    paid_used INTEGER DEFAULT 0 CHECK (paid_used >= 0),
    total_videos_generated INTEGER DEFAULT 0,
    total_videos_downloaded INTEGER DEFAULT 0,
    resets_at DATE DEFAULT (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
    
    -- Referral system
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    referral_count INTEGER DEFAULT 0,
    referral_rewards_claimed INTEGER DEFAULT 0,
    
    -- API key rotation index
    rotation_index INTEGER DEFAULT 0,
    
    -- Marketing attribution
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    acquisition_channel TEXT,
    
    -- User preferences
    notifications_enabled BOOLEAN DEFAULT true,
    marketing_emails_enabled BOOLEAN DEFAULT true,
    dark_mode BOOLEAN DEFAULT true,
    preferred_quality TEXT DEFAULT '1080p',
    preferred_aspect_ratio TEXT DEFAULT '9:16',
    
    -- Onboarding
    has_seen_onboarding BOOLEAN DEFAULT false,
    onboarding_completed_at TIMESTAMPTZ,
    
    -- Session tracking
    last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    login_count INTEGER DEFAULT 1,
    
    -- Device info
    device_platform TEXT CHECK (device_platform IN ('ios', 'android', 'web', NULL)),
    device_model TEXT,
    app_version TEXT,
    os_version TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_resets_at ON users(resets_at);

-- ============================================
-- GENERATIONS TABLE
-- Video generation tasks and results (async pattern)
-- ============================================
CREATE TABLE IF NOT EXISTS generations (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT,  -- Provider's task/request ID
    
    -- Generation input
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    
    -- Configuration
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise')),
    model TEXT,  -- Provider model name
    provider TEXT CHECK (provider IN ('fal', 'wan', 'luma', 'minimax', 'replicate', 'piapi', NULL)),
    aspect_ratio TEXT DEFAULT '9:16',
    duration INTEGER DEFAULT 10,
    resolution TEXT DEFAULT '768p',
    
    -- Results
    video_url TEXT,
    thumbnail_url TEXT,
    preview_url TEXT,
    file_size INTEGER,
    actual_duration DECIMAL(10, 2),
    
    -- Status tracking (for async polling)
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
    error TEXT,
    error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Cost tracking
    cost DECIMAL(10, 6) DEFAULT 0,
    credits_used INTEGER DEFAULT 1,
    
    -- Performance metrics
    queue_time_ms INTEGER,
    generation_time_ms INTEGER,
    total_time_ms INTEGER,
    poll_count INTEGER DEFAULT 0,
    
    -- User engagement
    shared_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes for generations table
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_task_id ON generations(task_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_model ON generations(model);
CREATE INDEX IF NOT EXISTS idx_generations_provider ON generations(provider);
CREATE INDEX IF NOT EXISTS idx_generations_user_status ON generations(user_id, status);

-- ============================================
-- API KEYS TABLE
-- Provider API keys with rotation and rate limiting
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL CHECK (provider IN ('fal', 'replicate', 'piapi', 'minimax', 'luma')),
    key_value TEXT NOT NULL,
    key_name TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,
    
    -- Usage tracking
    free_credits_remaining INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    
    -- Rate limiting
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_day INTEGER DEFAULT 1000,
    current_minute_requests INTEGER DEFAULT 0,
    current_day_requests INTEGER DEFAULT 0,
    rate_limit_reset_at TIMESTAMPTZ,
    
    -- Error tracking
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    consecutive_errors INTEGER DEFAULT 0,
    disabled_reason TEXT,
    
    -- Timestamps
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider_active ON api_keys(provider, is_active);

-- ============================================
-- WEBHOOK LOGS TABLE
-- Track incoming webhooks from providers
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id TEXT,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    source TEXT CHECK (source IN ('fal', 'replicate', 'piapi', 'minimax', 'stripe', 'other')),
    event_type TEXT,
    status TEXT,
    payload JSONB,
    response_code INTEGER,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_task_id ON webhook_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_generation_id ON webhook_logs(generation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source);

-- ============================================
-- USER SESSIONS TABLE
-- Track user sessions for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    session_token TEXT UNIQUE,
    device_fingerprint TEXT,
    
    -- Session info
    ip_address INET,
    user_agent TEXT,
    platform TEXT,
    browser TEXT,
    country_code TEXT,
    city TEXT,
    
    -- Duration
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Activity
    pages_viewed INTEGER DEFAULT 0,
    videos_generated INTEGER DEFAULT 0,
    videos_downloaded INTEGER DEFAULT 0,
    
    -- Referrer
    referrer_url TEXT,
    landing_page TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);

-- ============================================
-- APP EVENTS TABLE
-- Track user interactions for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS app_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    
    event_name TEXT NOT NULL,
    event_category TEXT CHECK (event_category IN ('engagement', 'conversion', 'error', 'navigation', 'system')),
    event_data JSONB,
    
    -- Context
    screen_name TEXT,
    referrer TEXT,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_events_user_id ON app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_events_event_name ON app_events(event_name);
CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_category ON app_events(event_category);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for Vercel serverless functions)
-- These policies allow the Supabase service key to access all data
DROP POLICY IF EXISTS "Service role has full access to users" ON users;
CREATE POLICY "Service role has full access to users"
    ON users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to generations" ON generations;
CREATE POLICY "Service role has full access to generations"
    ON generations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to api_keys" ON api_keys;
CREATE POLICY "Service role has full access to api_keys"
    ON api_keys FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to webhook_logs" ON webhook_logs;
CREATE POLICY "Service role has full access to webhook_logs"
    ON webhook_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to user_sessions" ON user_sessions;
CREATE POLICY "Service role has full access to user_sessions"
    ON user_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to app_events" ON app_events;
CREATE POLICY "Service role has full access to app_events"
    ON app_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_flag BOOLEAN;
BEGIN
    LOOP
        code := 'NC' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
        SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = code) INTO exists_flag;
        EXIT WHEN NOT exists_flag;
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate referral code on user creation
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := generate_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_referral_code ON users;
CREATE TRIGGER trigger_set_referral_code
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_referral_code();

-- Reset monthly free usage (call this with a cron job)
CREATE OR REPLACE FUNCTION reset_monthly_free_usage()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE users
    SET 
        free_used = 0,
        paid_used = 0,
        resets_at = (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE resets_at <= CURRENT_DATE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Get next active API key for a provider (with rotation)
CREATE OR REPLACE FUNCTION get_active_key(provider_name TEXT)
RETURNS TEXT AS $$
DECLARE
    key_val TEXT;
BEGIN
    SELECT key_value INTO key_val
    FROM api_keys
    WHERE provider = provider_name
      AND is_active = true
      AND consecutive_errors < 3
    ORDER BY last_used_at NULLS FIRST, total_requests ASC
    LIMIT 1;
    
    IF key_val IS NOT NULL THEN
        UPDATE api_keys
        SET 
            last_used_at = CURRENT_TIMESTAMP,
            total_requests = total_requests + 1,
            current_minute_requests = current_minute_requests + 1
        WHERE provider = provider_name AND key_value = key_val;
    END IF;
    
    RETURN key_val;
END;
$$ LANGUAGE plpgsql;

-- Mark API key error
CREATE OR REPLACE FUNCTION mark_api_key_error(provider_name TEXT, key_val TEXT, error_msg TEXT)
RETURNS void AS $$
BEGIN
    UPDATE api_keys
    SET 
        failed_requests = failed_requests + 1,
        consecutive_errors = consecutive_errors + 1,
        last_error = error_msg,
        last_error_at = CURRENT_TIMESTAMP,
        is_active = CASE WHEN consecutive_errors >= 5 THEN false ELSE is_active END,
        disabled_reason = CASE WHEN consecutive_errors >= 5 THEN 'Too many consecutive errors' ELSE disabled_reason END
    WHERE provider = provider_name AND key_value = key_val;
END;
$$ LANGUAGE plpgsql;

-- Reset API key error count on success
CREATE OR REPLACE FUNCTION mark_api_key_success(provider_name TEXT, key_val TEXT)
RETURNS void AS $$
BEGIN
    UPDATE api_keys
    SET 
        successful_requests = successful_requests + 1,
        consecutive_errors = 0
    WHERE provider = provider_name AND key_value = key_val;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-UPDATE TRIGGERS
-- ============================================

-- Update updated_at timestamp on any update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update user stats on generation completion
CREATE OR REPLACE FUNCTION update_user_stats_on_generation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE users
        SET 
            total_videos_generated = total_videos_generated + 1,
            last_active_at = CURRENT_TIMESTAMP
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_stats ON generations;
CREATE TRIGGER trigger_update_user_stats
    AFTER INSERT OR UPDATE ON generations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_on_generation();

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Daily generation stats
CREATE OR REPLACE VIEW daily_generation_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_generations,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE tier = 'free') as free_tier,
    COUNT(*) FILTER (WHERE tier != 'free') as paid_tier,
    AVG(total_time_ms) FILTER (WHERE status = 'completed') as avg_generation_time_ms,
    SUM(cost) as total_cost
FROM generations
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Provider performance stats
CREATE OR REPLACE VIEW provider_performance AS
SELECT 
    provider,
    model,
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 2) as success_rate,
    AVG(total_time_ms) FILTER (WHERE status = 'completed') as avg_time_ms,
    SUM(cost) as total_cost
FROM generations
WHERE provider IS NOT NULL
GROUP BY provider, model
ORDER BY total_tasks DESC;

-- User engagement summary
CREATE OR REPLACE VIEW user_engagement_summary AS
SELECT 
    u.id,
    u.email,
    u.tier,
    u.free_used,
    u.total_videos_generated,
    u.created_at,
    u.last_active_at,
    COUNT(g.id) as generations_count,
    COUNT(g.id) FILTER (WHERE g.status = 'completed') as successful_generations
FROM users u
LEFT JOIN generations g ON u.id = g.user_id
GROUP BY u.id
ORDER BY u.total_videos_generated DESC;

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert a test user (uncomment to use)
-- INSERT INTO users (device_id, email, tier, free_used)
-- VALUES ('test-device-001', 'test@example.com', 'free', 0)
-- ON CONFLICT (device_id) DO NOTHING;

-- ============================================
-- GRANTS
-- ============================================

-- Grant usage to authenticated users (if using Supabase Auth)
-- GRANT USAGE ON SCHEMA public TO authenticated;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- NOTES
-- ============================================

-- 1. Run this schema in Supabase SQL Editor
-- 2. Set up environment variables in Vercel:
--    - SUPABASE_URL: Your Supabase project URL
--    - SUPABASE_KEY: Your Supabase service role key (not anon key!)
-- 3. For monthly usage reset, set up a cron job to call:
--    SELECT reset_monthly_free_usage();
-- 4. Monitor the provider_performance view to track API success rates

-- End of schema
