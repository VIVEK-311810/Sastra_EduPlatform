const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Helper function to get numeric session ID from string session ID
async function getNumericSessionId(stringSessionId) {
  const sessionResult = await pool.query(
    "SELECT id FROM sessions WHERE session_id = $1",
    [stringSessionId.toUpperCase()]
  );
  if (sessionResult.rows.length === 0) {
    return null;
  }
  return sessionResult.rows[0].id;
}

// Create a new session
router.post("/", async (req, res) => {
  try {
    const { title, course_name, teacher_id } = req.body;
    if (!title || !course_name || !teacher_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // The database schema has a trigger to generate session_id if not provided
    // So we can directly insert and let the DB handle it.
    const result = await pool.query(
      "INSERT INTO sessions (title, course_name, teacher_id, is_active) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, course_name, teacher_id, true] // Sessions are active by default
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all sessions for a teacher
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const result = await pool.query(`
      SELECT 
        s.*,
        COALESCE(participant_counts.participant_count, 0) as participant_count,
        COALESCE(poll_counts.poll_count, 0) as poll_count
      FROM sessions s
      LEFT JOIN (
        SELECT 
          session_id, 
          COUNT(*) as participant_count 
        FROM session_participants 
        WHERE is_active = true 
        GROUP BY session_id
      ) participant_counts ON s.id = participant_counts.session_id
      LEFT JOIN (
        SELECT 
          session_id, 
          COUNT(*) as poll_count 
        FROM polls 
        GROUP BY session_id
      ) poll_counts ON s.id = poll_counts.session_id
      WHERE s.teacher_id = $1 
      ORDER BY s.created_at DESC
    `, [teacherId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching teacher sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single session by session_id (user-facing)
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      "SELECT * FROM sessions WHERE session_id = $1",
      [sessionId.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Student joins a session
router.post("/:sessionId/join", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    // FIXED: Include session_id, title, course_name for proper frontend navigation
    const sessionResult = await pool.query(
      "SELECT id, session_id, title, course_name, is_active FROM sessions WHERE session_id = $1",
      [sessionId.toUpperCase()]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];
    const numericSessionId = session.id;

    if (!session.is_active) {
      return res.status(403).json({ error: "Session is not active" });
    }

    // Check if student is already a participant
    const existingParticipant = await pool.query(
      "SELECT * FROM session_participants WHERE session_id = $1 AND student_id = $2",
      [numericSessionId, student_id]
    );

    if (existingParticipant.rows.length > 0) {
      // Return complete session data for navigation
      return res.status(200).json({ 
        message: "Already joined session", 
        session: {
          id: session.id,
          session_id: session.session_id,
          title: session.title,
          course_name: session.course_name,
          is_active: session.is_active
        }
      });
    }

    // Add student to session participants
    await pool.query(
      "INSERT INTO session_participants (session_id, student_id) VALUES ($1, $2)",
      [numericSessionId, student_id]
    );

    // Return complete session data for navigation
    res.status(201).json({ 
      message: "Successfully joined session", 
      session: {
        id: session.id,
        session_id: session.session_id,
        title: session.title,
        course_name: session.course_name,
        is_active: session.is_active
      }
    });
  } catch (error) {
    console.error("Error joining session:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get participants for a session
router.get("/:sessionId/participants", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);

    if (numericSessionId === null) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      `SELECT sp.student_id as id, u.full_name as name, u.email, sp.joined_at, sp.is_active
       FROM session_participants sp
       JOIN users u ON sp.student_id = u.id
       WHERE sp.session_id = $1 AND sp.is_active = true
       ORDER BY sp.joined_at DESC`,
      [numericSessionId]
    );
    
    res.json({ 
      participants: result.rows,
      count: result.rows.length 
    });
  } catch (error) {
    console.error("Error fetching participants:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get active poll for a session
router.get("/:sessionId/active-poll", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);

    if (numericSessionId === null) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      "SELECT * FROM polls WHERE session_id = $1 AND is_active = TRUE ORDER BY activated_at DESC LIMIT 1",
      [numericSessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No active poll found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching active poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:sessionId/polls", async (req, res ) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    
    if (numericSessionId === null) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      "SELECT * FROM polls WHERE session_id = $1 ORDER BY created_at DESC",
      [numericSessionId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching polls:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get generated MCQs for a session
router.get("/:sessionId/generated-mcqs", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);

    if (numericSessionId === null) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      "SELECT * FROM generated_mcqs WHERE session_id = $1 AND sent_to_students = FALSE ORDER BY created_at DESC",
      [numericSessionId]
    );
    res.json({ mcqs: result.rows });
  } catch (error) {
    console.error("Error fetching generated MCQs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


module.exports = router;