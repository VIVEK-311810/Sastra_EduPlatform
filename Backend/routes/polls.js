const express = require('express');
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

// Create a new poll
router.post("/", async (req, res) => {
  try {
    const { session_id, question, options, correct_answer, justification, time_limit } = req.body;
    
    if (!session_id || !question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "Missing required fields or invalid options" });
    }

    // Verify session exists
    const numericSessionId = await getNumericSessionId(session_id);
    if (numericSessionId === null) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      "INSERT INTO polls (session_id, question, options, correct_answer, justification, time_limit, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [numericSessionId, question, JSON.stringify(options), correct_answer, justification, time_limit || 60, false] // Polls are created as inactive (false)
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get poll by ID
router.get("/:pollId", async (req, res) => {
  try {
    const { pollId } = req.params;
    
    const result = await pool.query(
      "SELECT * FROM polls WHERE id = $1",
      [pollId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Activate a poll
router.put("/:pollId/activate", async (req, res) => {
  const client = await pool.connect();
  try {
    const { pollId } = req.params;
    
    await client.query("BEGIN");

    // Get the session_id of the poll to be activated
    const pollResult = await client.query(
      "SELECT session_id FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Poll not found" });
    }

    const sessionId = pollResult.rows[0].session_id;

    // Deactivate any other active polls in the same session
    // FIXED: Removed closed_at column reference
    await client.query(
      "UPDATE polls SET is_active = FALSE WHERE session_id = $1 AND is_active = TRUE",
      [sessionId]
    );

    // Activate the selected poll
    // FIXED: Removed closed_at = NULL reference
    const result = await client.query(
      "UPDATE polls SET is_active = TRUE, activated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [pollId]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error activating poll:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Close a poll
router.put("/:pollId/close", async (req, res) => {
  try {
    const { pollId } = req.params;
    
    // FIXED: Removed closed_at column reference
    const result = await pool.query(
      "UPDATE polls SET is_active = FALSE WHERE id = $1 RETURNING *",
      [pollId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found" });
    }

    // Determine the session string ID for broadcasting and timer clearing
    const sessionQuery = await pool.query(
      `SELECT s.session_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );

    if (sessionQuery.rows.length > 0) {
      const sessionIdString = sessionQuery.rows[0].session_id;
      // Clear any pending reveal timer for this session
      if (global.clearPollTimer) {
        try {
          global.clearPollTimer(sessionIdString);
        } catch (e) {
          console.warn('Failed to clear poll timer during close:', e);
        }
      }

      // Broadcast poll deactivation so clients can reset state
      if (global.wss) {
        try {
          const WebSocket = require('ws');
          global.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'poll-deactivated',
                sessionId: sessionIdString,
                pollId: parseInt(pollId)
              }));
            }
          });
        } catch (e) {
          console.warn('Failed to broadcast poll deactivation:', e);
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error closing poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Submit a poll response
router.post("/:pollId/respond", async (req, res) => {
  try {
    const { pollId } = req.params;
    const { student_id, selected_option, response_time } = req.body;

    if (student_id === undefined || selected_option === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if poll exists and is active
    const pollResult = await pool.query(
      "SELECT * FROM polls WHERE id = $1 AND is_active = TRUE",
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found or not active" });
    }

    // Check if student already responded
    const existingResponse = await pool.query(
      "SELECT * FROM poll_responses WHERE poll_id = $1 AND student_id = $2",
      [pollId, student_id]
    );

    if (existingResponse.rows.length > 0) {
      return res.status(400).json({ error: "Already responded to this poll" });
    }

    // Check if student is part of the session
    const poll = pollResult.rows[0];
    const participantCheck = await pool.query(
      "SELECT * FROM session_participants WHERE session_id = $1 AND student_id = $2",
      [poll.session_id, student_id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: "Student not part of this session" });
    }

    // Determine if answer is correct
    const isCorrect = poll.correct_answer !== null ? selected_option === poll.correct_answer : null;

    // Insert response
    const result = await pool.query(
      "INSERT INTO poll_responses (poll_id, student_id, selected_option, is_correct, response_time) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [pollId, student_id, selected_option, isCorrect, response_time || 0]
    );

    // Check if all online participants have responded
    await checkAndTriggerReveal(poll.session_id, pollId);

    res.status(201).json({ message: "Response submitted successfully", data: result.rows[0] });
  } catch (error) {
    console.error("Error submitting poll response:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to check if all online participants have responded and trigger reveal
async function checkAndTriggerReveal(sessionId, pollId) {
  try {
    // Get count of online participants
    const onlineParticipants = await pool.query(
      "SELECT COUNT(*) as count FROM session_participants WHERE session_id = $1 AND is_active = true",
      [sessionId]
    );
    
    // Get count of poll responses
    const pollResponses = await pool.query(
      "SELECT COUNT(*) as count FROM poll_responses WHERE poll_id = $1",
      [pollId]
    );
    
    const onlineCount = parseInt(onlineParticipants.rows[0].count);
    const responseCount = parseInt(pollResponses.rows[0].count);
    
    console.log(`Poll ${pollId}: ${responseCount}/${onlineCount} participants responded`);
    
    // If all online participants have responded, trigger reveal
    if (responseCount >= onlineCount && onlineCount > 0) {
      console.log(`All participants responded for poll ${pollId}. Triggering reveal.`);
      await triggerAnswerReveal(sessionId, pollId);
    }
  } catch (error) {
    console.error("Error checking reveal conditions:", error);
  }
}

// Function to trigger answer reveal via WebSocket
async function triggerAnswerReveal(sessionId, pollId) {
  try {
    // Get poll details for the reveal
    const pollResult = await pool.query(
      "SELECT * FROM polls WHERE id = $1",
      [pollId]
    );
    
    if (pollResult.rows.length === 0) {
      console.error("Poll not found for reveal:", pollId);
      return;
    }
    
    const poll = pollResult.rows[0];
    
    // Get session details to find the session_id string
    const sessionResult = await pool.query(
      "SELECT session_id FROM sessions WHERE id = $1",
      [sessionId]
    );
    
    if (sessionResult.rows.length === 0) {
      console.error("Session not found for reveal:", sessionId);
      return;
    }
    
    const sessionIdString = sessionResult.rows[0].session_id;
    
    // Broadcast reveal message to all students in the session
    // Note: This requires access to the WebSocket server instance
    // For now, we'll use a global reference or require the WebSocket module
    const WebSocket = require('ws');
    
    // This is a simplified approach - in a real implementation, you'd want to
    // store WebSocket connections in a more sophisticated way
    if (global.wss) {
      const revealMessage = {
        type: 'reveal-answers',
        sessionId: sessionIdString,
        pollId: pollId,
        correctAnswer: poll.correct_answer,
        poll: poll
      };
      
      // Broadcast to all connected clients
      global.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(revealMessage));
        }
      });
      
      console.log(`Answer reveal broadcasted for poll ${pollId} in session ${sessionIdString}`);
    } else {
      console.warn("WebSocket server not available for broadcasting reveal");
    }
  } catch (error) {
    console.error("Error triggering answer reveal:", error);
  }
}

// Get poll responses
router.get("/:pollId/responses", async (req, res) => {
  try {
    const { pollId } = req.params;
    
    const result = await pool.query(`
      SELECT pr.*, u.full_name as student_name, u.register_number
      FROM poll_responses pr
      JOIN users u ON pr.student_id = u.id
      WHERE pr.poll_id = $1
      ORDER BY pr.submitted_at ASC
    `, [pollId]);

    // Also get poll details for context
    const pollResult = await pool.query(
      "SELECT * FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found" });
    }

    const poll = pollResult.rows[0];
    const responses = result.rows;

    // Calculate statistics
    const totalResponses = responses.length;
    const optionCounts = {};
    const correctCount = responses.filter(r => r.is_correct === true).length;
    
    // Count responses for each option
    poll.options.forEach((option, index) => {
      optionCounts[index] = responses.filter(r => r.selected_option === index).length;
    });

    const stats = {
      totalResponses,
      correctResponses: correctCount,
      accuracyRate: totalResponses > 0 ? (correctCount / totalResponses * 100).toFixed(1) : 0,
      optionCounts,
      averageResponseTime: totalResponses > 0 ? 
        (responses.reduce((sum, r) => sum + (r.response_time || 0), 0) / totalResponses).toFixed(1) : 0
    };

    res.json({
      poll,
      responses,
      stats
    });
  } catch (error) {
    console.error("Error fetching poll responses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a poll (only if not active and no responses)
router.delete("/:pollId", async (req, res) => {
  try {
    const { pollId } = req.params;
    
    // Check if poll has responses
    const responseCheck = await pool.query(
      "SELECT COUNT(*) as count FROM poll_responses WHERE poll_id = $1",
      [pollId]
    );

    if (parseInt(responseCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: "Cannot delete poll with existing responses" });
    }

    // Check if poll is active
    const pollCheck = await pool.query(
      "SELECT is_active FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found" });
    }

    if (pollCheck.rows[0].is_active === true) {
      return res.status(400).json({ error: "Cannot delete active poll" });
    }

    // Delete the poll
    await pool.query("DELETE FROM polls WHERE id = $1", [pollId]);
    
    res.json({ message: "Poll deleted successfully" });
  } catch (error) {
    console.error("Error deleting poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update poll (only if inactive)
router.put("/:pollId", async (req, res) => {
  try {
    const { pollId } = req.params;
    const { question, options, correct_answer, justification, time_limit } = req.body;
    
    // Check if poll is inactive
    const pollCheck = await pool.query(
      "SELECT is_active FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ error: "Poll not found" });
    }

    if (pollCheck.rows[0].is_active === true) {
      return res.status(400).json({ error: "Can only edit inactive polls" });
    }

    const result = await pool.query(
      "UPDATE polls SET question = $1, options = $2, correct_answer = $3, justification = $4, time_limit = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *",
      [question, JSON.stringify(options), correct_answer, justification, time_limit, pollId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating poll:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;