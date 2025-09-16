-- Enhanced Poll Queue System Schema with Fixed Ambiguous Column Reference
-- This file contains the complete queue system with proper column aliasing

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS complete_poll_and_advance(INTEGER);
DROP FUNCTION IF EXISTS activate_next_poll(INTEGER);
DROP FUNCTION IF EXISTS get_next_poll_in_queue(INTEGER);

-- Add queue-related columns to polls table if they don't exist
DO $$ 
BEGIN
    -- Add queue_status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'polls' AND column_name = 'queue_status') THEN
        ALTER TABLE polls ADD COLUMN queue_status VARCHAR(20) DEFAULT 'none';
    END IF;
    
    -- Add queue_position column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'polls' AND column_name = 'queue_position') THEN
        ALTER TABLE polls ADD COLUMN queue_position INTEGER;
    END IF;
    
    -- Add activated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'polls' AND column_name = 'activated_at') THEN
        ALTER TABLE polls ADD COLUMN activated_at TIMESTAMP;
    END IF;
END $$;

-- Create poll_queue_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS poll_queue_history (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    poll_id INTEGER REFERENCES polls(id),
    action VARCHAR(50) NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    triggered_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create queue_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS queue_settings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) UNIQUE,
    auto_advance BOOLEAN DEFAULT false,
    poll_duration INTEGER DEFAULT 60,
    break_between_polls INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to get next poll in queue
CREATE OR REPLACE FUNCTION get_next_poll_in_queue(session_id_param INTEGER)
RETURNS TABLE(poll_id INTEGER, queue_position INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.queue_position
    FROM polls p
    WHERE p.session_id = session_id_param 
      AND p.queue_status = 'queued'
    ORDER BY p.queue_position ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- FIXED: Function to activate next poll in queue with proper column aliasing
CREATE OR REPLACE FUNCTION activate_next_poll(session_id_param INTEGER)
RETURNS TABLE(activated_poll_id INTEGER, queue_position INTEGER) AS $$
DECLARE
    next_poll_id INTEGER;
    next_position INTEGER;
BEGIN
    -- FIXED: Get the next poll in queue with explicit column aliasing
    SELECT q.poll_id, q.queue_position INTO next_poll_id, next_position
    FROM get_next_poll_in_queue(session_id_param) AS q;
    
    IF next_poll_id IS NOT NULL THEN
        -- Deactivate any currently active polls in the session
        UPDATE polls 
        SET is_active = false, 
            queue_status = CASE 
                WHEN queue_status = 'active' THEN 'completed' 
                ELSE queue_status 
            END
        WHERE session_id = session_id_param AND is_active = true;
        
        -- Activate the next poll
        UPDATE polls 
        SET queue_status = 'active', 
            is_active = true, 
            activated_at = CURRENT_TIMESTAMP
        WHERE id = next_poll_id;
        
        -- Log the activation
        INSERT INTO poll_queue_history (session_id, poll_id, action, previous_status, new_status, triggered_by)
        VALUES (session_id_param, next_poll_id, 'activated', 'queued', 'active', 'system');
        
        RETURN QUERY SELECT next_poll_id, next_position;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- FIXED: Function to complete current poll and advance queue
CREATE OR REPLACE FUNCTION complete_poll_and_advance(poll_id_param INTEGER)
RETURNS TABLE(completed_poll_id INTEGER, next_poll_id INTEGER) AS $$
DECLARE
    session_id_param INTEGER;
    auto_advance_enabled BOOLEAN;
    activated_poll_id INTEGER;
BEGIN
    -- Get session ID from the poll
    SELECT session_id INTO session_id_param 
    FROM polls 
    WHERE id = poll_id_param;
    
    IF session_id_param IS NULL THEN
        RAISE EXCEPTION 'Poll not found: %', poll_id_param;
    END IF;
    
    -- Check if auto-advance is enabled for this session
    SELECT COALESCE(auto_advance, false) INTO auto_advance_enabled
    FROM queue_settings 
    WHERE session_id = session_id_param;
    
    -- Mark the current poll as completed
    UPDATE polls 
    SET queue_status = 'completed', 
        is_active = false
    WHERE id = poll_id_param;
    
    -- Log the completion
    INSERT INTO poll_queue_history (session_id, poll_id, action, previous_status, new_status, triggered_by)
    VALUES (session_id_param, poll_id_param, 'completed', 'active', 'completed', 'system');
    
    -- If auto-advance is enabled, activate the next poll
    IF auto_advance_enabled THEN
        -- FIXED: Use explicit column selection from activate_next_poll
        SELECT ap.activated_poll_id INTO activated_poll_id
        FROM activate_next_poll(session_id_param) AS ap;
        
        RETURN QUERY SELECT poll_id_param, activated_poll_id;
    ELSE
        RETURN QUERY SELECT poll_id_param, NULL::INTEGER;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to add poll to queue
CREATE OR REPLACE FUNCTION add_poll_to_queue(poll_id_param INTEGER, session_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    max_position INTEGER;
BEGIN
    -- Get the highest queue position for this session
    SELECT COALESCE(MAX(queue_position), 0) INTO max_position
    FROM polls 
    WHERE session_id = session_id_param AND queue_status IN ('queued', 'active');
    
    -- Add poll to queue
    UPDATE polls 
    SET queue_status = 'queued', 
        queue_position = max_position + 1
    WHERE id = poll_id_param;
    
    -- Log the queuing
    INSERT INTO poll_queue_history (session_id, poll_id, action, previous_status, new_status, triggered_by)
    VALUES (session_id_param, poll_id_param, 'queued', 'none', 'queued', 'teacher');
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to remove poll from queue
CREATE OR REPLACE FUNCTION remove_poll_from_queue(poll_id_param INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    session_id_param INTEGER;
    removed_position INTEGER;
BEGIN
    -- Get session ID and position of the poll being removed
    SELECT session_id, queue_position INTO session_id_param, removed_position
    FROM polls 
    WHERE id = poll_id_param;
    
    -- Remove poll from queue
    UPDATE polls 
    SET queue_status = 'none', 
        queue_position = NULL
    WHERE id = poll_id_param;
    
    -- Reorder remaining polls in queue
    UPDATE polls 
    SET queue_position = queue_position - 1
    WHERE session_id = session_id_param 
      AND queue_position > removed_position 
      AND queue_status IN ('queued', 'active');
    
    -- Log the removal
    INSERT INTO poll_queue_history (session_id, poll_id, action, previous_status, new_status, triggered_by)
    VALUES (session_id_param, poll_id_param, 'removed', 'queued', 'none', 'teacher');
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to reorder queue
CREATE OR REPLACE FUNCTION reorder_queue(session_id_param INTEGER, poll_order INTEGER[])
RETURNS BOOLEAN AS $$
DECLARE
    poll_id_item INTEGER;
    position_counter INTEGER := 1;
BEGIN
    -- Update queue positions based on the provided order
    FOREACH poll_id_item IN ARRAY poll_order
    LOOP
        UPDATE polls 
        SET queue_position = position_counter
        WHERE id = poll_id_item AND session_id = session_id_param;
        
        position_counter := position_counter + 1;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_polls_queue_status ON polls(session_id, queue_status);
CREATE INDEX IF NOT EXISTS idx_polls_queue_position ON polls(session_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_poll_queue_history_session ON poll_queue_history(session_id);

-- Add comments for documentation
COMMENT ON FUNCTION get_next_poll_in_queue IS 'Returns the next poll to be activated in the queue';
COMMENT ON FUNCTION activate_next_poll IS 'Activates the next poll in queue and returns its details';
COMMENT ON FUNCTION complete_poll_and_advance IS 'Completes current poll and auto-advances if enabled';
COMMENT ON FUNCTION add_poll_to_queue IS 'Adds a poll to the queue with proper positioning';
COMMENT ON FUNCTION remove_poll_from_queue IS 'Removes a poll from queue and reorders remaining polls';
COMMENT ON FUNCTION reorder_queue IS 'Reorders polls in queue based on provided array of poll IDs';

-- Grant necessary permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;