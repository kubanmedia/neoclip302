-- NeoClip Production - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT UNIQUE,
    email TEXT UNIQUE,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro')),
    free_used INTEGER DEFAULT 0 CHECK (free_used >= 0),
    resets_at DATE DEFAULT (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- ============================================
-- GENERATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT,
    prompt TEXT NOT NULL,
    tier TEXT DEFAULT 'free',
    length INTEGER DEFAULT 10,
    resolution TEXT DEFAULT '768p',
    model TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error TEXT,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for generations
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_task_id ON generations(task_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);

-- ============================================
-- WEBHOOK LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id TEXT,
    source TEXT,
    status TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for webhook logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_task_id ON webhook_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================
-- SUBSCRIPTIONS TABLE (for payment tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_price_id TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid')),
    tier TEXT NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- ============================================
-- REFERRALS TABLE (affiliate program)
-- ============================================
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
    reward_type TEXT DEFAULT 'free_month',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    UNIQUE(referrer_id, referred_id)
);

-- Index for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Function to reset monthly free usage
CREATE OR REPLACE FUNCTION reset_monthly_free_usage()
RETURNS void AS $$
BEGIN
    UPDATE users
    SET 
        free_used = 0,
        resets_at = (date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE resets_at <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to deduct credits (called from API)
CREATE OR REPLACE FUNCTION deduct_credits(uid UUID, c INTEGER DEFAULT 1)
RETURNS void AS $$
BEGIN
    UPDATE users
    SET 
        free_used = free_used + c,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = uid;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can generate (returns true/false)
CREATE OR REPLACE FUNCTION can_generate(uid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT tier, free_used, resets_at INTO user_record
    FROM users WHERE id = uid;
    
    IF user_record IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Paid tiers can always generate
    IF user_record.tier IN ('basic', 'pro') THEN
        RETURN TRUE;
    END IF;
    
    -- Free tier: check limit
    RETURN user_record.free_used < 10;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policy for service role (API access - full access)
-- Note: These policies allow the service role key to access all data
-- The service role is used by the Vercel API functions

CREATE POLICY "Service role has full access to users"
    ON users FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to generations"
    ON generations FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to subscriptions"
    ON subscriptions FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to referrals"
    ON referrals FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to webhook_logs"
    ON webhook_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generations_updated_at
    BEFORE UPDATE ON generations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================
-- Uncomment the following to insert test data:

-- INSERT INTO users (id, device_id, email, tier, free_used)
-- VALUES 
--     ('00000000-0000-0000-0000-000000000001', 'test-device-1', 'test@example.com', 'free', 0),
--     ('00000000-0000-0000-0000-000000000002', 'test-device-2', 'pro@example.com', 'pro', 0);
