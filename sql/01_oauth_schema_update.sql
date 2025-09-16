-- EDUCATIONAL PLATFORM - OAUTH2 SCHEMA UPDATE
-- =====================================================
-- Purpose: Update database schema to support OAuth2 authentication with SASTRA domain restrictions
-- Author: Manus AI
-- Version: 2.0
-- Last Updated: 2025-08-24
-- =====================================================

-- Drop existing users table and recreate with OAuth2 support
DROP TABLE IF EXISTS poll_responses CASCADE;
DROP TABLE IF EXISTS generated_mcqs CASCADE;
DROP TABLE IF EXISTS polls CASCADE;
DROP TABLE IF EXISTS session_participants CASCADE;
DROP TABLE IF EXISTS queue_settings CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- UPDATED USERS TABLE WITH OAUTH2 SUPPORT
-- =====================================================
-- Stores both teachers and students with OAuth2 authentication
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY, -- Custom ID: hash for teachers, number for students
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
    register_number VARCHAR(50), -- For students only (same as ID for students)
    department VARCHAR(100),
    oauth_provider VARCHAR(50) DEFAULT 'google',
    oauth_id VARCHAR(255),
    profile_picture_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_register_number ON users(register_number);
CREATE INDEX idx_users_oauth_id ON users(oauth_id);

-- Add constraints for SASTRA domain validation
ALTER TABLE users ADD CONSTRAINT check_sastra_email 
CHECK (
    (role = 'teacher' AND email LIKE '%@sastra.edu') OR
    (role = 'student' AND email LIKE '%@sastra.ac.in')
);

-- Add constraint for student email format (must be number@sastra.ac.in)
ALTER TABLE users ADD CONSTRAINT check_student_email_format
CHECK (
    role != 'student' OR 
    (email ~ '^[0-9]+@sastra\.ac\.in$')
);

-- =====================================================
-- SESSIONS TABLE (Updated to use VARCHAR ID)
-- =====================================================
-- Stores class sessions created by teachers
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(20) UNIQUE NOT NULL, -- The ID students use to join (e.g., "ABC123")
    teacher_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    course_name VARCHAR(255),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_teacher_id ON sessions(teacher_id);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);

-- =====================================================
-- SESSION PARTICIPANTS TABLE (Updated to use VARCHAR ID)
-- =====================================================
-- Tracks which students have joined which sessions
CREATE TABLE session_participants (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    connection_status VARCHAR(20) DEFAULT 'offline' CHECK (connection_status IN ('online', 'offline')),
    websocket_id VARCHAR(255),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_id)
);

-- Create indexes for performance
CREATE INDEX idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX idx_session_participants_student_id ON session_participants(student_id);
CREATE INDEX idx_session_participants_active ON session_participants(is_active);

-- =====================================================
-- POLLS TABLE (Enhanced with queue management)
-- =====================================================
-- Stores polls/MCQs created by teachers for sessions
CREATE TABLE polls (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of options: ["Option A", "Option B", "Option C", "Option D"]
    correct_answer INTEGER, -- Index of correct answer (0-based)
    justification TEXT, -- Explanation for the correct answer
    time_limit INTEGER DEFAULT 60, -- Time limit in seconds
    is_active BOOLEAN DEFAULT false,
    queue_status VARCHAR(20) DEFAULT 'manual' CHECK (queue_status IN ('manual', 'queued', 'active', 'completed')),
    queue_position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_polls_session_id ON polls(session_id);
CREATE INDEX idx_polls_is_active ON polls(is_active);
CREATE INDEX idx_polls_queue_status ON polls(queue_status);
CREATE INDEX idx_polls_queue_position ON polls(queue_position);
CREATE INDEX idx_polls_created_at ON polls(created_at);

-- =====================================================
-- POLL RESPONSES TABLE (Updated to use VARCHAR ID)
-- =====================================================
-- Stores student responses to polls
CREATE TABLE poll_responses (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    selected_option INTEGER NOT NULL, -- Index of selected option (0-based)
    is_correct BOOLEAN,
    response_time INTEGER, -- Time taken to respond in seconds
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, student_id)
);

-- Create indexes for performance
CREATE INDEX idx_poll_responses_poll_id ON poll_responses(poll_id);
CREATE INDEX idx_poll_responses_student_id ON poll_responses(student_id);
CREATE INDEX idx_poll_responses_responded_at ON poll_responses(responded_at);

-- =====================================================
-- GENERATED MCQS TABLE (Updated)
-- =====================================================
-- Stores AI-generated MCQs before they become active polls
CREATE TABLE generated_mcqs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of options
    correct_answer INTEGER NOT NULL, -- Index of correct answer (0-based)
    justification TEXT,
    time_limit INTEGER DEFAULT 60,
    sent_to_students BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_generated_mcqs_session_id ON generated_mcqs(session_id);
CREATE INDEX idx_generated_mcqs_sent_to_students ON generated_mcqs(sent_to_students);
CREATE INDEX idx_generated_mcqs_created_at ON generated_mcqs(created_at);

-- =====================================================
-- QUEUE SETTINGS TABLE
-- =====================================================
-- Stores queue management settings for sessions
CREATE TABLE queue_settings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
    auto_advance BOOLEAN DEFAULT true,
    poll_duration INTEGER DEFAULT 60,
    break_between_polls INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================

-- Function to generate random session ID
CREATE OR REPLACE FUNCTION generate_session_id() RETURNS VARCHAR(6) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(6) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate session_id if not provided
CREATE OR REPLACE FUNCTION set_session_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_id IS NULL OR NEW.session_id = '' THEN
        LOOP
            NEW.session_id := generate_session_id();
            -- Check if this session_id already exists
            IF NOT EXISTS (SELECT 1 FROM sessions WHERE session_id = NEW.session_id) THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_session_id
    BEFORE INSERT ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_session_id();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at for users
CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for queue_settings
CREATE TRIGGER trigger_update_queue_settings_updated_at
    BEFORE UPDATE ON queue_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for active sessions with participant count
CREATE VIEW active_sessions_with_participants AS
SELECT 
    s.id,
    s.session_id,
    s.title,
    s.course_name,
    s.teacher_id,
    u.full_name as teacher_name,
    s.created_at,
    COUNT(sp.student_id) as participant_count
FROM sessions s
LEFT JOIN users u ON s.teacher_id = u.id
LEFT JOIN session_participants sp ON s.id = sp.session_id AND sp.is_active = true
WHERE s.is_active = true
GROUP BY s.id, s.session_id, s.title, s.course_name, s.teacher_id, u.full_name, s.created_at;

-- View for student session participation with details
CREATE VIEW student_session_details AS
SELECT 
    sp.student_id,
    sp.session_id as numeric_session_id,
    s.session_id,
    s.title,
    s.course_name,
    s.is_active,
    u.full_name as teacher_name,
    sp.joined_at,
    sp.is_active as participation_active
FROM session_participants sp
JOIN sessions s ON sp.session_id = s.id
JOIN users u ON s.teacher_id = u.id
WHERE sp.is_active = true;

-- View for poll statistics
CREATE VIEW poll_statistics AS
SELECT 
    p.id as poll_id,
    p.session_id,
    p.question,
    COUNT(pr.id) as total_responses,
    COUNT(CASE WHEN pr.is_correct = true THEN 1 END) as correct_responses,
    ROUND(
        (COUNT(CASE WHEN pr.is_correct = true THEN 1 END)::DECIMAL / 
         NULLIF(COUNT(pr.id), 0)) * 100, 2
    ) as accuracy_percentage,
    AVG(pr.response_time) as avg_response_time
FROM polls p
LEFT JOIN poll_responses pr ON p.id = pr.poll_id
GROUP BY p.id, p.session_id, p.question;

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON TABLE users IS 'Stores both teachers and students with OAuth2 authentication and SASTRA domain restrictions';
COMMENT ON TABLE sessions IS 'Class sessions created by teachers that students can join';
COMMENT ON TABLE session_participants IS 'Junction table tracking student participation in sessions with real-time status';
COMMENT ON TABLE polls IS 'Polls/MCQs created by teachers for real-time student engagement with queue management';
COMMENT ON TABLE poll_responses IS 'Student responses to polls with timing and correctness tracking';
COMMENT ON TABLE generated_mcqs IS 'AI-generated MCQs awaiting teacher approval and activation';
COMMENT ON TABLE queue_settings IS 'Queue management settings for automated poll progression';

COMMENT ON COLUMN users.id IS 'Custom ID: SHA256 hash of name for teachers, student number for students';
COMMENT ON COLUMN users.email IS 'Must be @sastra.edu for teachers or number@sastra.ac.in for students';
COMMENT ON COLUMN sessions.session_id IS 'Human-readable ID that students use to join sessions (e.g., ABC123)';
COMMENT ON COLUMN polls.options IS 'JSON array of poll options, e.g., ["Option A", "Option B", "Option C", "Option D"]';
COMMENT ON COLUMN polls.correct_answer IS 'Zero-based index of the correct answer in the options array';
COMMENT ON COLUMN poll_responses.selected_option IS 'Zero-based index of the option selected by the student';

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Educational Platform OAuth2 Database Schema Created Successfully!';
    RAISE NOTICE 'Tables: users (OAuth2), sessions, session_participants, polls, poll_responses, generated_mcqs, queue_settings';
    RAISE NOTICE 'Views: active_sessions_with_participants, student_session_details, poll_statistics';
    RAISE NOTICE 'Triggers: Auto session_id generation, updated_at timestamps';
    RAISE NOTICE 'Constraints: SASTRA domain validation, student email format validation';
END $$;

