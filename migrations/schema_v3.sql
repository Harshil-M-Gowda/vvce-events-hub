-- ============================================================
--  VVCE Events Hub — Schema V3
--  Run AFTER schema.sql + schema_v2.sql
--  psql -U postgres -d vvce_events -f migrations/schema_v3.sql
-- ============================================================

-- ─── EXTEND STUDENTS TABLE ────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='phone') THEN
    ALTER TABLE students ADD COLUMN phone VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='department') THEN
    ALTER TABLE students ADD COLUMN department VARCHAR(80);
  END IF;
END $$;

-- ─── IMPORTED / PRIOR AICTE POINTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imported_aicte_points (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0,
  note         VARCHAR(200) DEFAULT 'Imported prior points',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id)
);

-- ─── EXTEND EVENTS: AICTE TOGGLE ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='gives_aicte_points') THEN
    ALTER TABLE events ADD COLUMN gives_aicte_points BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='aicte_points_value') THEN
    ALTER TABLE events ADD COLUMN aicte_points_value INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ─── CERTIFICATES V2 ──────────────────────────────────────────────────────────
-- Drop old unique constraint and rebuild with new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='cert_type') THEN
    ALTER TABLE certificates
      ADD COLUMN cert_type VARCHAR(20) NOT NULL DEFAULT 'platform'
        CHECK (cert_type IN ('platform','external')),
      ADD COLUMN title VARCHAR(200),
      ADD COLUMN notes TEXT,
      ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;
    -- Remove old NOT NULL on event_id (external certs may not have event)
    ALTER TABLE certificates ALTER COLUMN event_id DROP NOT NULL;
    -- Remove unique constraint that breaks multi-cert per student
    ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_event_id_student_id_key;
  END IF;
END $$;

-- ─── PAYMENT PROOF (future-ready, not active yet) ────────────────────────────
CREATE TABLE IF NOT EXISTS payment_proofs (
  id              SERIAL PRIMARY KEY,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  screenshot_url  TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     INTEGER REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_reg ON payment_proofs(registration_id);

-- Extend events: payment proof toggle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='requires_payment_proof') THEN
    ALTER TABLE events ADD COLUMN requires_payment_proof BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── PRINCIPAL AVAILABILITY ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS principal_availability (
  id         SERIAL PRIMARY KEY,
  status     VARCHAR(30) NOT NULL DEFAULT 'Available in Cabin'
               CHECK (status IN (
                 'Available in Cabin','In Meeting','Outside Campus',
                 'Busy','Not Available'
               )),
  note       VARCHAR(200),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert one default row (singleton pattern — only if table is empty)
DO $avail$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM principal_availability LIMIT 1) THEN
    INSERT INTO principal_availability (status) VALUES ('Not Available');
  END IF;
END $avail$;

-- ─── PRINCIPAL SCHEDULE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS principal_schedule (
  id           SERIAL PRIMARY KEY,
  schedule_date DATE NOT NULL,
  start_time   VARCHAR(10) NOT NULL,
  end_time     VARCHAR(10) NOT NULL,
  purpose      VARCHAR(200) NOT NULL,
  location     VARCHAR(200),
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_principal_schedule_date ON principal_schedule(schedule_date);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_principal_schedule_updated_at ON principal_schedule;
CREATE TRIGGER trg_principal_schedule_updated_at
  BEFORE UPDATE ON principal_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_payment_proofs_updated_at ON payment_proofs;
CREATE TRIGGER trg_payment_proofs_updated_at
  BEFORE UPDATE ON payment_proofs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── EXTEND REGISTRATIONS: payment proof flag ─────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='payment_proof_status') THEN
    ALTER TABLE registrations
      ADD COLUMN payment_proof_status VARCHAR(20) DEFAULT NULL
        CHECK (payment_proof_status IN ('pending','approved','rejected',NULL));
  END IF;
END $$;

