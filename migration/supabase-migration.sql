-- ============================================================
-- Revenue Kitchen — FULL Supabase Migration SQL
-- Run this in your NEW Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New Query)
--
-- Consolidates 3 old Supabase projects into 1:
--   - ryxrgbvymudmqqpefmmf (sales-hub, rep-roll, deal-rooms)
--   - eadtaehsjzelskyjybwz (rep-brackets, rep-drop, rep-madness)
--   - Citation Checker's Supabase project
--
-- Total: 28 tables across 7 projects
-- ============================================================


-- ############################################################
-- SECTION A: REVENUE KITCHEN AUTH (sales-hub)
-- ############################################################

-- ============================================================
-- A1. ALLOWED EMAILS (allowlist for auth gate)
-- ============================================================
CREATE TABLE IF NOT EXISTS allowed_emails (
    email TEXT PRIMARY KEY,
    added_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read allowlist"
    ON allowed_emails FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can manage allowlist"
    ON allowed_emails FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- A2. PROFILES (user accounts with disable flag)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    disabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read profiles"
    ON profiles FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Authenticated users can update any profile"
    ON profiles FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for new profiles"
    ON profiles FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- A3. AUTO-CONFIRM USERS + AUTO-CREATE PROFILE (triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email_confirmed_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER confirm_user_on_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_confirm_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- A4. SEED: Allowed Emails
-- ============================================================
INSERT INTO allowed_emails (email) VALUES
    ('scottknudson@rankings.io'),
    ('zach@rankings.io'),
    ('jessica@rankings.io'),
    ('claudia@rankings.io'),
    ('sydny@rankings.io')
ON CONFLICT (email) DO NOTHING;


-- ############################################################
-- SECTION B: REP ROLL (rep-roll)
-- ############################################################

-- ============================================================
-- B1. REP ROLL — Team 1 (Sales)
-- ============================================================
CREATE TABLE IF NOT EXISTS rr_reps (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#888',
    tokens INT DEFAULT 0,
    earnings INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rr_bets (
    id BIGSERIAL PRIMARY KEY,
    rep_id BIGINT REFERENCES rr_reps(id) ON DELETE CASCADE,
    number INT NOT NULL,
    tokens INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rr_history (
    id BIGSERIAL PRIMARY KEY,
    roll INT NOT NULL,
    seven_out BOOLEAN DEFAULT false,
    winners_json JSONB DEFAULT '[]',
    rolled_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rr_state (
    id INT PRIMARY KEY DEFAULT 1,
    designated_roller TEXT
);

ALTER TABLE rr_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON rr_reps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr_bets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr_state FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- B2. REP ROLL — Team 2
-- ============================================================
CREATE TABLE IF NOT EXISTS rr2_reps (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#888',
    tokens INT DEFAULT 0,
    earnings INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rr2_bets (
    id BIGSERIAL PRIMARY KEY,
    rep_id BIGINT REFERENCES rr2_reps(id) ON DELETE CASCADE,
    number INT NOT NULL,
    tokens INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rr2_history (
    id BIGSERIAL PRIMARY KEY,
    roll INT NOT NULL,
    seven_out BOOLEAN DEFAULT false,
    winners_json JSONB DEFAULT '[]',
    rolled_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rr2_state (
    id INT PRIMARY KEY DEFAULT 1,
    designated_roller TEXT
);

ALTER TABLE rr2_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr2_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr2_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rr2_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON rr2_reps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr2_bets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr2_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rr2_state FOR ALL USING (true) WITH CHECK (true);


-- ############################################################
-- SECTION C: REP MADNESS / REP BRACKETS
-- ############################################################

CREATE TABLE IF NOT EXISTS rm_players (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    total_entries INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rm_brackets (
    id BIGSERIAL PRIMARY KEY,
    player_name TEXT NOT NULL,
    entry_number INT DEFAULT 1,
    picks JSONB DEFAULT '{}',
    submitted BOOLEAN DEFAULT false
);

ALTER TABLE rm_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON rm_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rm_brackets FOR ALL USING (true) WITH CHECK (true);


-- ############################################################
-- SECTION D: REP DROP
-- ############################################################

CREATE TABLE IF NOT EXISTS rd_reps (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tokens INT DEFAULT 0,
    total_won INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rd_drops (
    id BIGSERIAL PRIMARY KEY,
    rep_name TEXT,
    slot INT,
    prize TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rd_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rd_drops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON rd_reps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON rd_drops FOR ALL USING (true) WITH CHECK (true);


-- ############################################################
-- SECTION E: DEAL ROOMS
-- ############################################################

-- ============================================================
-- E1. Deals (core record)
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    hubspot_deal_id TEXT,
    company_name TEXT NOT NULL,
    company_domain TEXT,
    logo_url TEXT,
    deal_stage TEXT DEFAULT 'discovery',
    rep_name TEXT,
    rep_email TEXT,
    prospect_name TEXT,
    prospect_email TEXT,
    access_code TEXT,
    show_onboarding BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E2. Milestones
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    owner TEXT,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'complete')),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E3. Resources
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    resource_type TEXT DEFAULT 'link' CHECK (resource_type IN ('pdf', 'video', 'link', 'doc')),
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E4. Recordings
-- ============================================================
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    date DATE,
    duration_minutes INT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E5. Contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'signed')),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E6. Onboarding Steps
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    owner TEXT,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'complete')),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- E7. HubSpot Files
-- ============================================================
CREATE TABLE IF NOT EXISTS hubspot_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    hubspot_file_id TEXT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    file_type TEXT,
    size_bytes BIGINT,
    visible BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Deal Rooms RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_files ENABLE ROW LEVEL SECURITY;

-- Full access (internal tool)
CREATE POLICY "Full access" ON deals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON milestones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON resources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON recordings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON contracts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON onboarding_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON hubspot_files FOR ALL USING (true) WITH CHECK (true);

-- Deal Rooms Indexes
CREATE INDEX idx_deals_slug ON deals(slug);
CREATE INDEX idx_deals_hubspot_deal_id ON deals(hubspot_deal_id);
CREATE INDEX idx_milestones_deal_id ON milestones(deal_id);
CREATE INDEX idx_resources_deal_id ON resources(deal_id);
CREATE INDEX idx_recordings_deal_id ON recordings(deal_id);
CREATE INDEX idx_contracts_deal_id ON contracts(deal_id);
CREATE INDEX idx_onboarding_steps_deal_id ON onboarding_steps(deal_id);
CREATE INDEX idx_hubspot_files_deal_id ON hubspot_files(deal_id);


-- ############################################################
-- SECTION F: CITATION CHECKER (Directory Presence Grader)
-- ############################################################

-- ============================================================
-- F1. Audits (core record)
-- ============================================================
CREATE TABLE IF NOT EXISTS audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    firm_url TEXT NOT NULL,
    internal_notes TEXT,
    run_by TEXT,
    status TEXT DEFAULT 'crawling' CHECK (status IN ('crawling', 'confirming', 'checking', 'scoring', 'complete', 'error')),
    firm_name TEXT,
    overall_score INTEGER,
    firm_score INTEGER,
    attorney_avg_score INTEGER
);

-- ============================================================
-- F2. Audit Locations
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    name TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    is_primary BOOLEAN DEFAULT false,
    location_score INTEGER
);

-- ============================================================
-- F3. Audit Attorneys
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_attorneys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    practice_areas TEXT[],
    bar_states TEXT[],
    phone TEXT,
    email TEXT,
    attorney_score INTEGER
);

-- ============================================================
-- F4. Audit Practice Areas
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_practice_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    practice_area TEXT NOT NULL,
    category TEXT
);

-- ============================================================
-- F5. Audit Directory Checks
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_directory_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('firm', 'attorney')),
    entity_id UUID,
    directory_name TEXT NOT NULL,
    directory_tier INTEGER,
    directory_type TEXT,
    is_found BOOLEAN DEFAULT false,
    is_possible_match BOOLEAN DEFAULT false,
    user_verified BOOLEAN,
    presence_level INTEGER DEFAULT 0,
    listing_url TEXT,
    has_photo BOOLEAN,
    has_reviews BOOLEAN,
    review_count INTEGER,
    has_website_link BOOLEAN,
    has_description BOOLEAN,
    checked_at TIMESTAMPTZ DEFAULT now(),
    raw_data JSONB
);

-- ============================================================
-- F6. Directories (static reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS directories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    base_url TEXT NOT NULL,
    search_url_template TEXT,
    tier INTEGER NOT NULL,
    type TEXT NOT NULL,
    entity_level TEXT NOT NULL,
    practice_areas TEXT[],
    weight INTEGER DEFAULT 1,
    check_method TEXT,
    is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- F7. State Bars (static reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS state_bars (
    state_code TEXT PRIMARY KEY,
    state_name TEXT NOT NULL,
    bar_name TEXT NOT NULL,
    directory_url TEXT NOT NULL,
    search_url_template TEXT
);

-- ============================================================
-- F8. Team Members
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Citation Checker RLS
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_attorneys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_practice_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_directory_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE directories ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Full access for authenticated users
CREATE POLICY "Authenticated users full access" ON audits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON audit_locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON audit_attorneys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON audit_practice_areas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON audit_directory_checks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON directories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON state_bars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON team_members FOR ALL USING (true) WITH CHECK (true);

-- Public read for shared audit reports
CREATE POLICY "Public read audits" ON audits FOR SELECT USING (status = 'complete');
CREATE POLICY "Public read locations" ON audit_locations FOR SELECT USING (true);
CREATE POLICY "Public read attorneys" ON audit_attorneys FOR SELECT USING (true);
CREATE POLICY "Public read practice areas" ON audit_practice_areas FOR SELECT USING (true);
CREATE POLICY "Public read directory checks" ON audit_directory_checks FOR SELECT USING (true);

-- Citation Checker Indexes
CREATE INDEX idx_audits_status ON audits(status);
CREATE INDEX idx_audits_created_at ON audits(created_at DESC);
CREATE INDEX idx_audit_locations_audit_id ON audit_locations(audit_id);
CREATE INDEX idx_audit_attorneys_audit_id ON audit_attorneys(audit_id);
CREATE INDEX idx_audit_practice_areas_audit_id ON audit_practice_areas(audit_id);
CREATE INDEX idx_audit_directory_checks_audit_id ON audit_directory_checks(audit_id);
CREATE INDEX idx_audit_directory_checks_entity ON audit_directory_checks(entity_type, entity_id);


-- ############################################################
-- SECTION G: UNIFIED AUDIT TOOLS (rankings-audit-tools-src)
-- ############################################################

-- ============================================================
-- G1. Unified Audits (multi-scanner audit runs)
-- ============================================================
CREATE TABLE IF NOT EXISTS unified_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    firm_url TEXT NOT NULL,
    firm_name TEXT,
    slug TEXT UNIQUE,
    run_by TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'crawling', 'scanning', 'review', 'published', 'error')),
    crawl_pages_count INT,
    sections_enabled JSONB DEFAULT '{}',
    sub_checks_enabled JSONB DEFAULT '{}',
    excluded_checks JSONB DEFAULT '{}',
    is_password_protected BOOLEAN DEFAULT false,
    password_hash TEXT
);

-- ============================================================
-- G2. Unified Audit Results (per-scanner results)
-- ============================================================
CREATE TABLE IF NOT EXISTS unified_audit_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES unified_audits(id) ON DELETE CASCADE,
    scanner_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'error', 'disabled')),
    result_data JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT
);

-- ============================================================
-- G3. Unified Crawl Cache
-- ============================================================
CREATE TABLE IF NOT EXISTS unified_crawl_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    crawled_at TIMESTAMPTZ DEFAULT now(),
    crawl_data JSONB,
    pages_count INT,
    expires_at TIMESTAMPTZ
);

ALTER TABLE unified_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_crawl_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access" ON unified_audits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON unified_audit_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access" ON unified_crawl_cache FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_unified_audits_slug ON unified_audits(slug);
CREATE INDEX idx_unified_audits_status ON unified_audits(status);
CREATE INDEX idx_unified_audit_results_audit_id ON unified_audit_results(audit_id);
CREATE INDEX idx_unified_crawl_cache_domain ON unified_crawl_cache(domain);


-- ############################################################
-- SECTION H: RANKINGS SWAG STORE
-- ############################################################

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    items JSONB NOT NULL,
    shipping_name TEXT NOT NULL,
    shipping_email TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_state TEXT NOT NULL,
    shipping_zip TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered'))
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow update orders" ON orders FOR UPDATE USING (true);


-- ############################################################
-- SECTION K: REALTIME
-- ############################################################

ALTER PUBLICATION supabase_realtime ADD TABLE rr_reps;
ALTER PUBLICATION supabase_realtime ADD TABLE rr_bets;
ALTER PUBLICATION supabase_realtime ADD TABLE rr_history;
ALTER PUBLICATION supabase_realtime ADD TABLE rr_state;
ALTER PUBLICATION supabase_realtime ADD TABLE rr2_reps;
ALTER PUBLICATION supabase_realtime ADD TABLE rr2_bets;
ALTER PUBLICATION supabase_realtime ADD TABLE rr2_history;
ALTER PUBLICATION supabase_realtime ADD TABLE rr2_state;


-- ############################################################
-- DONE!
-- ############################################################
-- Total: 34 tables across 9 projects (CommTrack, Pinyata, quadrants excluded)
--
-- After running this:
-- 1. Authentication > Providers > Email — make sure it's enabled
-- 2. Email settings — turn OFF "Confirm email"
-- 3. Settings > API — copy your Project URL and anon key
-- 4. Give those to Claude to swap into all code files
--
-- Projects that need Supabase credential updates:
--   sales-hub              — auth.js, l10-tracker.html
--   rep-roll               — index.html
--   rep-brackets           — index.html
--   rep-madness            — brackets.html
--   rep-drop               — index.html
--   deal-rooms             — .env.local (URL, anon key, service role key)
--   Citation Checker       — .env.local (URL, anon key, service role key)
--   rankings-audit-tools-src — .env.local (URL, anon key, service role key)
--   rankings-audit-tools   — .env.local (URL, anon key, service role key)
--   rankings-swag-store    — .env.local (needs to be created)
--
-- Projects that need .env.local updates (non-Supabase):
--   brandbench               — Anthropic API key, Cloudflare creds
--   client-acquisition-grader — Cloudflare creds
--   consideration-audit      — Cloudflare creds
--   content-audit            — Cloudflare creds
--   ai-readiness-grader      — Cloudflare creds
--   rankings-audit-tools-src — Cloudinary, Cloudflare, Anthropic
--   rankings-audit-tools     — Cloudinary, Cloudflare, Anthropic
--   deal-rooms               — HubSpot token + webhook secret
-- ############################################################
