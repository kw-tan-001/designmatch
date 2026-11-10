-- =====================================================================
-- DesignMatch - Interior Design Matching Platform
-- Migration 001: initial schema (PostgreSQL 13+)
-- Every table below maps 1:1 to an Entity class in src/entity/.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- User profiles (role definitions + permission sets)   -> UserProfile
-- Stories 12-16. Suspending a profile blocks every account that uses it
-- without deleting those accounts (story 15).
-- ---------------------------------------------------------------------
CREATE TABLE user_profiles (
    profile_id     SERIAL PRIMARY KEY,
    name           VARCHAR(60)  NOT NULL UNIQUE,
    role           VARCHAR(20)  NOT NULL
                   CHECK (role IN ('admin', 'designer', 'customer', 'manager')),
    description    VARCHAR(500) NOT NULL DEFAULT '',
    permissions    TEXT[]       NOT NULL DEFAULT '{}',
    is_suspended   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_profiles_role ON user_profiles (role);

-- ---------------------------------------------------------------------
-- User accounts                                        -> UserAccount
-- Passwords are only ever stored as bcrypt hashes.
-- ---------------------------------------------------------------------
CREATE TABLE user_accounts (
    account_id            SERIAL PRIMARY KEY,
    profile_id            INTEGER      NOT NULL REFERENCES user_profiles (profile_id) ON DELETE RESTRICT,
    email                 VARCHAR(255) NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    full_name             VARCHAR(120) NOT NULL,
    phone                 VARCHAR(30),
    location              VARCHAR(80),
    status                VARCHAR(20)  NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended')),
    must_change_password  BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_accounts_email ON user_accounts (LOWER(email));
CREATE INDEX idx_accounts_profile    ON user_accounts (profile_id);
CREATE INDEX idx_accounts_status     ON user_accounts (status);
CREATE INDEX idx_accounts_created    ON user_accounts (created_at);
CREATE INDEX idx_accounts_name       ON user_accounts (LOWER(full_name));

-- ---------------------------------------------------------------------
-- Interior designers (professional details + registration review)
--                                                      -> InteriorDesigner
-- Stories 3, 11, 17, 18.
-- ---------------------------------------------------------------------
CREATE TABLE interior_designers (
    designer_id          INTEGER PRIMARY KEY REFERENCES user_accounts (account_id) ON DELETE CASCADE,
    registration_status  VARCHAR(20)  NOT NULL DEFAULT 'pending'
                         CHECK (registration_status IN ('pending', 'approved', 'rejected')),
    rejection_reason     VARCHAR(500),
    reviewed_by          INTEGER REFERENCES user_accounts (account_id) ON DELETE SET NULL,
    reviewed_at          TIMESTAMPTZ,
    license_number       VARCHAR(60),
    years_experience     INTEGER NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 70),
    specialisation       VARCHAR(120),
    bio                  VARCHAR(2000),
    CONSTRAINT chk_rejection_reason CHECK (
        registration_status <> 'rejected' OR rejection_reason IS NOT NULL
    )
);
CREATE INDEX idx_designers_status ON interior_designers (registration_status);

-- ---------------------------------------------------------------------
-- Company profile (one per designer)                   -> Company
-- Story 19.
-- ---------------------------------------------------------------------
CREATE TABLE companies (
    company_id     SERIAL PRIMARY KEY,
    designer_id    INTEGER NOT NULL UNIQUE REFERENCES interior_designers (designer_id) ON DELETE CASCADE,
    company_name   VARCHAR(150) NOT NULL,
    description    VARCHAR(3000) NOT NULL DEFAULT '',
    logo_url       VARCHAR(500),
    contact_email  VARCHAR(255),
    contact_phone  VARCHAR(30),
    website        VARCHAR(255),
    address        VARCHAR(255),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_companies_name ON companies (LOWER(company_name));

CREATE TABLE company_service_areas (
    company_id  INTEGER     NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
    area_name   VARCHAR(80) NOT NULL,
    PRIMARY KEY (company_id, area_name)
);

-- ---------------------------------------------------------------------
-- Certifications / qualifications                      -> Certification
-- Story 20.
-- ---------------------------------------------------------------------
CREATE TABLE certifications (
    certification_id  SERIAL PRIMARY KEY,
    company_id        INTEGER      NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
    title             VARCHAR(150) NOT NULL,
    issuer            VARCHAR(150) NOT NULL,
    year_obtained     INTEGER CHECK (year_obtained BETWEEN 1950 AND 2100),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_certifications_company ON certifications (company_id);

-- ---------------------------------------------------------------------
-- Lookup tables                       -> IDPCategory, DesignStyle, PropertyType
-- Stories 24, 33, 50, 56, 57.
-- ---------------------------------------------------------------------
CREATE TABLE idp_categories (
    category_id  SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    description  VARCHAR(500) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_categories_name ON idp_categories (LOWER(name));

CREATE TABLE design_styles (
    style_id  SERIAL PRIMARY KEY,
    name      VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE property_types (
    property_type_id  SERIAL PRIMARY KEY,
    name              VARCHAR(60) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Interior Design Projects                             -> IDP
-- Stories 21-24, 31-33, 37-38, 43-47.
-- Deleting a category leaves its IDPs "Uncategorised" (SET NULL) rather
-- than deleting designers' work.
-- ---------------------------------------------------------------------
CREATE TABLE idps (
    idp_id            SERIAL PRIMARY KEY,
    designer_id       INTEGER      NOT NULL REFERENCES interior_designers (designer_id) ON DELETE CASCADE,
    category_id       INTEGER      REFERENCES idp_categories (category_id) ON DELETE SET NULL,
    property_type_id  INTEGER      REFERENCES property_types (property_type_id) ON DELETE SET NULL,
    title             VARCHAR(150) NOT NULL,
    description       TEXT         NOT NULL,
    status            VARCHAR(10)  NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'past')),
    budget_min        INTEGER      NOT NULL CHECK (budget_min >= 0),
    budget_max        INTEGER      NOT NULL,
    location          VARCHAR(80)  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_budget_range CHECK (budget_max >= budget_min)
);
CREATE INDEX idx_idps_designer      ON idps (designer_id);
CREATE INDEX idx_idps_category      ON idps (category_id);
CREATE INDEX idx_idps_property_type ON idps (property_type_id);
CREATE INDEX idx_idps_status        ON idps (status);
CREATE INDEX idx_idps_location      ON idps (LOWER(location));
CREATE INDEX idx_idps_budget        ON idps (budget_min, budget_max);
CREATE INDEX idx_idps_created       ON idps (created_at DESC);

CREATE TABLE idp_styles (
    idp_id    INTEGER NOT NULL REFERENCES idps (idp_id) ON DELETE CASCADE,
    style_id  INTEGER NOT NULL REFERENCES design_styles (style_id) ON DELETE CASCADE,
    PRIMARY KEY (idp_id, style_id)
);
CREATE INDEX idx_idp_styles_style ON idp_styles (style_id);

CREATE TABLE idp_photos (
    photo_id    SERIAL PRIMARY KEY,
    idp_id      INTEGER      NOT NULL REFERENCES idps (idp_id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    caption     VARCHAR(200) NOT NULL DEFAULT '',
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_idp_photos_idp ON idp_photos (idp_id, sort_order);

-- ---------------------------------------------------------------------
-- Engagement                          -> Favourite, IDPView, Enquiry
-- Stories 25-27, 34, 39-41, 48. Cascades guarantee no orphaned
-- favourites/views/enquiries when an IDP is deleted.
-- ---------------------------------------------------------------------
CREATE TABLE favourites (
    favourite_id  SERIAL PRIMARY KEY,
    customer_id   INTEGER     NOT NULL REFERENCES user_accounts (account_id) ON DELETE CASCADE,
    idp_id        INTEGER     NOT NULL REFERENCES idps (idp_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_favourite UNIQUE (customer_id, idp_id)
);
CREATE INDEX idx_favourites_idp     ON favourites (idp_id);
CREATE INDEX idx_favourites_created ON favourites (created_at);

CREATE TABLE idp_views (
    view_id    BIGSERIAL PRIMARY KEY,
    idp_id     INTEGER     NOT NULL REFERENCES idps (idp_id) ON DELETE CASCADE,
    viewer_id  INTEGER     REFERENCES user_accounts (account_id) ON DELETE SET NULL,
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_views_idp    ON idp_views (idp_id);
CREATE INDEX idx_views_viewed ON idp_views (viewed_at);

CREATE TABLE enquiries (
    enquiry_id     SERIAL PRIMARY KEY,
    idp_id         INTEGER      NOT NULL REFERENCES idps (idp_id) ON DELETE CASCADE,
    customer_id    INTEGER      NOT NULL REFERENCES user_accounts (account_id) ON DELETE CASCADE,
    designer_id    INTEGER      NOT NULL REFERENCES interior_designers (designer_id) ON DELETE CASCADE,
    message        VARCHAR(2000) NOT NULL,
    contact_phone  VARCHAR(30),
    status         VARCHAR(10)  NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_enquiries_designer ON enquiries (designer_id, created_at DESC);
CREATE INDEX idx_enquiries_customer ON enquiries (customer_id);
CREATE INDEX idx_enquiries_created  ON enquiries (created_at);

-- ---------------------------------------------------------------------
-- Search activity (feeds platform reports)             -> SearchLog
-- ---------------------------------------------------------------------
CREATE TABLE search_logs (
    search_id     BIGSERIAL PRIMARY KEY,
    account_id    INTEGER REFERENCES user_accounts (account_id) ON DELETE SET NULL,
    keyword       VARCHAR(200),
    filters       JSONB       NOT NULL DEFAULT '{}',
    result_count  INTEGER     NOT NULL DEFAULT 0,
    searched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_search_logs_at ON search_logs (searched_at);

-- ---------------------------------------------------------------------
-- Generated reports (history + export)                 -> Report
-- Stories 51-53, 58-60.
-- ---------------------------------------------------------------------
CREATE TABLE reports (
    report_id     SERIAL PRIMARY KEY,
    report_type   VARCHAR(10) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'custom')),
    title         VARCHAR(200) NOT NULL,
    period_start  DATE        NOT NULL,
    period_end    DATE        NOT NULL,
    generated_by  INTEGER     REFERENCES user_accounts (account_id) ON DELETE SET NULL,
    data          JSONB       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_report_period CHECK (period_end >= period_start)
);
CREATE INDEX idx_reports_type    ON reports (report_type, created_at DESC);

-- ---------------------------------------------------------------------
-- Session store used by express-session (connect-pg-simple layout)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    sid     VARCHAR      NOT NULL PRIMARY KEY,
    sess    JSON         NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON user_sessions (expire);

-- ---------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(200) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
