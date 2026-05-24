-- ═══════════════════════════════════════════════════════════
-- VVCE Events Hub — PostgreSQL Schema
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ─────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('student', 'admin', 'authority');
CREATE TYPE event_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled');
CREATE TYPE registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'waitlisted');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('upi', 'debit_card', 'credit_card', 'free');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late');
CREATE TYPE notification_type AS ENUM ('registration', 'approval', 'reminder', 'certificate', 'general');
CREATE TYPE interest_type AS ENUM ('technical', 'non_technical', 'communication', 'cultural', 'sports', 'management', 'other');
CREATE TYPE event_category AS ENUM ('technical', 'cultural', 'sports', 'workshop', 'management', 'non_technical', 'other');

-- ── USERS (base table for all roles) ─────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'student',
  full_name     VARCHAR(255) NOT NULL,
  is_verified   BOOLEAN DEFAULT FALSE,
  verify_token  VARCHAR(255),
  reset_token   VARCHAR(255),
  reset_expires TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ,
  CONSTRAINT email_vvce_check CHECK (email LIKE '%@vvce.ac.in')
);

-- ── STUDENTS (extends users) ──────────────────────────────
CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usn         VARCHAR(20) UNIQUE NOT NULL,
  current_year VARCHAR(10) NOT NULL,
  semester    INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  branch      VARCHAR(10) NOT NULL,
  section     CHAR(1) NOT NULL,
  total_activity_points INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── STUDENT INTERESTS ─────────────────────────────────────
CREATE TABLE student_interests (
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  interest    interest_type NOT NULL,
  PRIMARY KEY (student_id, interest)
);

-- ── ADMINS (extends users) ────────────────────────────────
CREATE TABLE admins (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_name    VARCHAR(255) NOT NULL,
  department   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUTHORITIES (extends users) ───────────────────────────
CREATE TABLE authorities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  designation  VARCHAR(100) NOT NULL,
  department   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── CLUBS ─────────────────────────────────────────────────
CREATE TABLE clubs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) UNIQUE NOT NULL,
  description  TEXT,
  admin_id     UUID REFERENCES admins(id),
  is_active    BOOLEAN DEFAULT TRUE,
  logo_url     VARCHAR(500),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── EVENTS ────────────────────────────────────────────────
CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  club_id           UUID REFERENCES clubs(id),
  organizer_id      UUID NOT NULL REFERENCES users(id),
  category          event_category NOT NULL,
  event_date        DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME,
  venue             VARCHAR(255) NOT NULL,
  max_participants  INTEGER NOT NULL DEFAULT 100,
  registration_fee  NUMERIC(10,2) DEFAULT 0.00,
  poster_url        VARCHAR(500),
  status            event_status DEFAULT 'draft',
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  allow_teams       BOOLEAN DEFAULT FALSE,
  min_team_size     INTEGER DEFAULT 1,
  max_team_size     INTEGER DEFAULT 1,
  activity_points   INTEGER DEFAULT 0,
  is_featured       BOOLEAN DEFAULT FALSE,
  likes_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── EVENT LIKES ───────────────────────────────────────────
CREATE TABLE event_likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

-- ── EVENT SAVES ───────────────────────────────────────────
CREATE TABLE event_saves (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

-- ── TEAMS ─────────────────────────────────────────────────
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  leader_id  UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── REGISTRATIONS ─────────────────────────────────────────
CREATE TABLE registrations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id),
  status       registration_status DEFAULT 'pending',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(event_id, student_id)
);

-- ── TEAM MEMBERS ──────────────────────────────────────────
CREATE TABLE team_members (
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  approved   BOOLEAN DEFAULT FALSE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  PRIMARY KEY (team_id, student_id)
);

-- ── PAYMENTS ──────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  method          payment_method NOT NULL,
  status          payment_status DEFAULT 'pending',
  transaction_id  VARCHAR(255),
  receipt_url     VARCHAR(500),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── CERTIFICATES ──────────────────────────────────────────
CREATE TABLE certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  certificate_url VARCHAR(500),
  uploaded_by     UUID REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  activity_points INTEGER DEFAULT 0,
  UNIQUE(event_id, student_id)
);

-- ── ATTENDANCE ────────────────────────────────────────────
CREATE TABLE attendance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status          attendance_status DEFAULT 'absent',
  marked_by       UUID REFERENCES users(id),
  marked_at       TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(event_id, student_id)
);

-- ── ACTIVITY POINTS HISTORY ───────────────────────────────
CREATE TABLE activity_points_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES events(id),
  points      INTEGER NOT NULL,
  description TEXT,
  awarded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type DEFAULT 'general',
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  link        VARCHAR(500),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── HOLIDAYS ──────────────────────────────────────────────
CREATE TABLE holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       VARCHAR(255) NOT NULL,
  holiday_date DATE UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_student ON registrations(student_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_attendance_event ON attendance(event_id);
CREATE INDEX idx_activity_history_student ON activity_points_history(student_id);
CREATE INDEX idx_certificates_student ON certificates(student_id);

-- ════════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at TRIGGER
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at  BEFORE UPDATE ON events  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════
-- VIEWS
-- ════════════════════════════════════════════════════════════

-- Full event details view
CREATE VIEW event_details AS
SELECT
  e.*,
  u.full_name AS organizer_name,
  c.name AS club_name,
  COUNT(DISTINCT r.id) AS registration_count,
  COUNT(DISTINCT el.user_id) AS like_count
FROM events e
LEFT JOIN users u ON e.organizer_id = u.id
LEFT JOIN clubs c ON e.club_id = c.id
LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
LEFT JOIN event_likes el ON e.id = el.event_id
GROUP BY e.id, u.full_name, c.name;

-- Student dashboard view
CREATE VIEW student_dashboard AS
SELECT
  s.id AS student_id,
  u.full_name,
  u.email,
  s.usn,
  s.branch,
  s.current_year,
  s.semester,
  s.total_activity_points,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'confirmed') AS registered_events,
  COUNT(DISTINCT cert.id) AS certificates_count
FROM students s
JOIN users u ON s.user_id = u.id
LEFT JOIN registrations r ON s.id = r.student_id
LEFT JOIN certificates cert ON s.id = cert.student_id
GROUP BY s.id, u.full_name, u.email, s.usn, s.branch, s.current_year, s.semester, s.total_activity_points;
