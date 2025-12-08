-- NeoClip 302 - Supabase Database Schema
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
    rotation_index INTEGER DEFAULT 0,
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
    model TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    status TEXT DEFAULT 'completed',
    error TEXT,
    cost DECIMAL(10, 6) DEFAULT 0,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Indexes for generations
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_task_id ON generations(task_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);

-- ============================================
-- API KEYS TABLE (for key rotation)
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL, -- 'replicate', 'fal', 'piapi'
    key_value TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    free_credits_remaining INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
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
    source TEXT,
    status TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_task_id ON webhook_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to users"
    ON users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to generations"
    ON generations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to api_keys"
    ON api_keys FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to webhook_logs"
    ON webhook_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Reset monthly free usage
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

-- Get next active API key for a provider
CREATE OR REPLACE FUNCTION get_active_key(provider_name TEXT)
RETURNS TEXT AS $$
DECLARE
    key_val TEXT;
BEGIN
    SELECT key_value INTO key_val
    FROM api_keys
    WHERE provider = provider_name
      AND is_active = true
    ORDER BY last_used_at NULLS FIRST
    LIMIT 1;
    
    IF key_val IS NOT NULL THEN
        UPDATE api_keys
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE provider = provider_name AND key_value = key_val;
    END IF;
    
    RETURN key_val;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-UPDATE TRIGGER
-- ============================================

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
