-- NeoClip 302 - Enhanced Supabase Database Schema with OAuth
-- Run this SQL in your Supabase SQL Editor to set up the database
-- Version: 3.2.0 - With Full OAuth User Data Collection

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (Enhanced with OAuth data collection)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authentication identifiers
    device_id TEXT UNIQUE,
    email TEXT UNIQUE,
    auth_provider TEXT DEFAULT 'anonymous', -- 'anonymous', 'google', 'apple', 'email'
    auth_provider_id TEXT, -- External provider user ID
    
    -- User profile data (collected during OAuth)
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    locale TEXT DEFAULT 'en',
    timezone TEXT,
    
    -- Account settings
    email_verified BOOLEAN DEFAULT false,
    phone TEXT,
    phone_verified BOOLEAN DEFAULT false,
    
    -- Subscription & billing
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'past_due', 'trialing'
    subscription_ends_at TIMESTAMPTZ,
    
    -- Usage tracking
    free_used INTEGER DEFAULT 0 CHECK (free_used >= 0),
    paid_used INTEGER DEFAULT 0 CHECK (paid_used >= 0),
    total_videos_generated INTEGER DEFAULT 0,
    total_videos_downloaded INTEGER DEFAULT 0,
    resets_at DATE DEFAULT (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
    
    -- Referral system
    referral_code TEXT UNIQUE,
    referred_by TEXT, -- referral_code of referrer
    referral_count INTEGER DEFAULT 0,
    referral_rewards_claimed INTEGER DEFAULT 0,
    
    -- API key rotation (for provider load balancing)
    rotation_index INTEGER DEFAULT 0,
    
    -- Marketing & analytics
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    acquisition_channel TEXT,
    
    -- Preferences
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
    device_platform TEXT, -- 'ios', 'android', 'web'
    device_model TEXT,
    app_version TEXT,
    os_version TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- ============================================
-- GENERATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Generation details
    task_id TEXT,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    
    -- Configuration
    tier TEXT DEFAULT 'free',
    model TEXT,
    provider TEXT, -- 'replicate', 'fal', 'piapi'
    aspect_ratio TEXT DEFAULT '9:16',
    duration INTEGER DEFAULT 10, -- seconds
    resolution TEXT DEFAULT '768p',
    
    -- Results
    video_url TEXT,
    thumbnail_url TEXT,
    preview_url TEXT,
    file_size INTEGER, -- bytes
    actual_duration DECIMAL(10, 2), -- actual video duration
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    error TEXT,
    error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Cost tracking
    cost DECIMAL(10, 6) DEFAULT 0,
    credits_used INTEGER DEFAULT 1,
    
    -- Performance metrics
    queue_time_ms INTEGER, -- time in queue
    generation_time_ms INTEGER, -- actual generation time
    total_time_ms INTEGER, -- total time including polling
    
    -- Analytics
    shared_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes for generations
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_task_id ON generations(task_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_model ON generations(model);

-- ============================================
-- API KEYS TABLE (for provider key rotation)
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL, -- 'replicate', 'fal', 'piapi', 'minimax'
    key_value TEXT NOT NULL,
    key_name TEXT, -- friendly name
    
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

-- ============================================
-- WEBHOOK LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id TEXT,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    source TEXT, -- 'replicate', 'fal', 'piapi', 'stripe'
    event_type TEXT,
    status TEXT,
    payload JSONB,
    response_code INTEGER,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_task_id ON webhook_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_generation_id ON webhook_logs(generation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================
-- USER SESSIONS TABLE (for analytics)
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
    videos_downloaded INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at DESC);

-- ============================================
-- APP EVENTS TABLE (for analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS app_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    
    event_name TEXT NOT NULL,
    event_category TEXT, -- 'engagement', 'conversion', 'error', 'navigation'
    event_data JSONB,
    
    -- Context
    screen_name TEXT,
    referrer TEXT,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_events_user_id ON app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_events_event_name ON app_events(event_name);
CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events(created_at DESC);

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
CREATE POLICY "Service role has full access to users"
    ON users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to generations"
    ON generations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to api_keys"
    ON api_keys FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to webhook_logs"
    ON webhook_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to user_sessions"
    ON user_sessions FOR ALL USING (true) WITH CHECK (true);

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
    exists BOOLEAN;
BEGIN
    LOOP
        code := 'NC' || upper(substring(md5(random()::text) from 1 for 6));
        SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = code) INTO exists;
        EXIT WHEN NOT exists;
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

-- Reset monthly free usage
CREATE OR REPLACE FUNCTION reset_monthly_free_usage()
RETURNS void AS $$
BEGIN
    UPDATE users
    SET 
        free_used = 0,
        paid_used = 0,
        resets_at = (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE resets_at <= CURRENT_DATE;
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

-- ============================================
-- AUTO-UPDATE TRIGGERS
-- ============================================

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
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
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
    AFTER UPDATE ON generations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_on_generation();
