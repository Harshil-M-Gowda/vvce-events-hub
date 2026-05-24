-- ============================================================
--  VVCE Events Hub — Schema V2 (New Feature Additions)
--  Run AFTER schema.sql: psql -U postgres -d vvce_events -f migrations/schema_v2.sql
-- ============================================================

-- ─── STUDENT PROFILES (Extended) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone          VARCHAR(20),
  linkedin       VARCHAR(255),
  github         VARCHAR(255),
  skills         JSONB DEFAULT '[]',
  bio            TEXT,
  resume_url     TEXT,
  achievements   JSONB DEFAULT '[]',
  photo_url      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ACTIVITY POINTS SEMESTER-WISE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semester_activity_points (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semester    VARCHAR(10) NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, semester)
);

-- ─── CLUB ADMINS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_admins (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
  club_name           VARCHAR(120) NOT NULL,
  club_category       VARCHAR(60) NOT NULL,
  faculty_coordinator VARCHAR(120) NOT NULL,
  club_email          VARCHAR(255) NOT NULL UNIQUE,
  phone               VARCHAR(20),
  club_description    TEXT,
  is_approved         BOOLEAN NOT NULL DEFAULT false,
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_admins_user     ON club_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_club_admins_approved ON club_admins(is_approved);

-- ─── PENDING CLUB APPROVALS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_club_approvals (
  id              SERIAL PRIMARY KEY,
  club_admin_id   INTEGER NOT NULL REFERENCES club_admins(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by     INTEGER REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── DEAN PORTAL LOGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dean_portal_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(200) NOT NULL,
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dean_logs_user ON dean_portal_logs(user_id);

-- ─── AUTHORITY EXTENDED ───────────────────────────────────────────────────────
-- Add sub_role to authorities if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='authorities' AND column_name='sub_role') THEN
    ALTER TABLE authorities ADD COLUMN sub_role VARCHAR(60) DEFAULT 'faculty';
  END IF;
END $$;

-- Update users role check to include pending_club_admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'admin', 'authority', 'pending_club_admin'));
