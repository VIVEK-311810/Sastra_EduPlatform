const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { passport } = require('./config/oauth-dynamic');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Make WebSocket server globally available for other modules
global.wss = wss;

// Store active connections by session
const sessionConnections = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('WebSocket message received:', data);
      
      switch (data.type) {
        case 'join-session':
          handleJoinSession(ws, data);
          break;
        case 'poll-response':
          handlePollResponse(ws, data);
          break;
        case 'activate-poll':
          handleActivatePoll(data);
          break;
        case 'heartbeat':
          handleHeartbeat(data);
          break;
        default:
          console.log('Unknown message type:', data.type);
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    // Remove from session connections
    for (const [sessionId, connections] of sessionConnections.entries()) {
      const index = connections.indexOf(ws);
      if (index !== -1) {
        connections.splice(index, 1);
        if (connections.length === 0) {
          sessionConnections.delete(sessionId);
        }
        break;
      }
    }
  });
});

function handleJoinSession(ws, data) {
  const { sessionId, studentId } = data;
  
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, []);
  }
  
  sessionConnections.get(sessionId).push(ws);
  ws.sessionId = sessionId;
  ws.studentId = studentId;
  
  console.log(`Student ${studentId} joined session ${sessionId}`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'session-joined',
    sessionId: sessionId,
    message: 'Successfully joined session'
  }));
  
  // Broadcast participant count update
  broadcastToSession(sessionId, {
    type: 'participant-count-updated',
    count: sessionConnections.get(sessionId).length
  });
}

function handlePollResponse(ws, data) {
  console.log('Poll response received:', data);
  // Here you would save the response to database
  // and potentially broadcast results
}

// Store active poll timers (globally accessible)
global.pollTimers = global.pollTimers || new Map();

// Utility to clear a poll timer for a session (globally accessible)
global.clearPollTimer = function(sessionId) {
  try {
    if (global.pollTimers && global.pollTimers.has(sessionId)) {
      clearTimeout(global.pollTimers.get(sessionId));
      global.pollTimers.delete(sessionId);
      console.log(`Cleared poll timer for session ${sessionId}`);
    }
  } catch (e) {
    console.error('Error clearing poll timer:', e);
  }
};

function handleActivatePoll(data) {
  const { sessionId, poll } = data;
  console.log(`Activating poll for session ${sessionId}:`, poll);
  
  broadcastToSession(sessionId, {
    type: 'poll-activated',
    poll: poll
  });
  
  // Clear any existing timer for this session
  if (global.pollTimers.has(sessionId)) {
    clearTimeout(global.pollTimers.get(sessionId));
  }
  
  // Set timer for poll expiration
  const timeLimit = (poll.time_limit || 60) * 1000; // Convert to milliseconds
  const timer = setTimeout(async () => {
    console.log(`Poll ${poll.id} time expired for session ${sessionId}. Triggering reveal.`);
    await triggerAnswerRevealFromTimer(sessionId, poll.id);
    global.pollTimers.delete(sessionId);
  }, timeLimit);
  
  global.pollTimers.set(sessionId, timer);
  console.log(`Set ${poll.time_limit || 60}s timer for poll ${poll.id} in session ${sessionId}`);
}

// Function to trigger answer reveal when timer expires
async function triggerAnswerRevealFromTimer(sessionId, pollId) {
  try {
    // Import the trigger function from polls.js
    // For now, we'll duplicate the logic here
    const revealMessage = {
      type: 'reveal-answers',
      sessionId: sessionId,
      pollId: pollId,
      reason: 'time-expired'
    };
    
    // Get poll details
    const pollResult = await pool.query(
      "SELECT * FROM polls WHERE id = $1",
      [pollId]
    );
    
    if (pollResult.rows.length > 0) {
      const poll = pollResult.rows[0];
      revealMessage.correctAnswer = poll.correct_answer;
      revealMessage.poll = poll;
    }
    
    broadcastToSession(sessionId, revealMessage);
    console.log(`Answer reveal broadcasted due to timer expiry for poll ${pollId} in session ${sessionId}`);
  } catch (error) {
    console.error("Error triggering timer-based answer reveal:", error);
  }
}

async function handleHeartbeat(data) {
  try {
    console.log(`Heartbeat received from student ${data.studentId} in session ${data.sessionId}`);
    
    // Update last activity in database using the string sessionId
    await pool.query(
      `UPDATE session_participants 
       SET last_activity = CURRENT_TIMESTAMP 
       WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1) 
       AND student_id = $2`,
      [data.sessionId, data.studentId]
    );
    
    console.log(`Heartbeat updated for student ${data.studentId} in session ${data.sessionId}`);
  } catch (error) {
    console.error('Error updating heartbeat:', error);
  }
}

function broadcastToSession(sessionId, message) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    console.log(`Broadcasting to ${connections.length} connections in session ${sessionId}:`, message);
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  } else {
    console.warn(`No connections found for session ${sessionId}`);
  }
}

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://sastra-eduplatform-frontend.onrender.com', // Your frontend URL
    'https://sastra-eduplatform.onrender.com' // Alternative URL
  ],
  credentials: true
} ));
app.use(express.json());

// Session middleware for OAuth2
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Import route modules
const authRouter = require('./routes/auth-dynamic');
const sessionsRouter = require('./routes/sessions');
const pollsRouter = require('./routes/polls');
const resourcesRouter = require('./routes/resources');
const generatedMCQsRoutes = require('./routes/generated-mcqs');
const studentsRouter = require('./routes/students');

// Use route modules
app.use('/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/polls', pollsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/students', studentsRouter);
app.use('/api', generatedMCQsRoutes);

// OAuth2 authentication is now handled by /auth routes

// Generated MCQs endpoint - receives POST with session_id & MCQs

// Session participant management endpoints
app.post('/api/sessions/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { student_id, websocket_id } = req.body;
    
    const query = `
      INSERT INTO session_participants (session_id, student_id, connection_status, websocket_id, is_active)
      VALUES ((SELECT id FROM sessions WHERE session_id = $1), $2, 'online', $3, true)
      ON CONFLICT (session_id, student_id) 
      DO UPDATE SET 
        connection_status = 'online',
        joined_at = CURRENT_TIMESTAMP,
        left_at = NULL,
        is_active = true,
        websocket_id = $3,
        last_activity = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, student_id, websocket_id]);
    
    // Broadcast participant count update
    const countQuery = `
      SELECT COUNT(*) as count FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.session_id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
    `;
    const countResult = await pool.query(countQuery, [sessionId]);
    
    broadcastToSession(sessionId, {
      type: 'participant-count-updated',
      count: parseInt(countResult.rows[0].count)
    });
    
    res.json({ success: true, participant: result.rows[0] });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sessions/:sessionId/leave', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { student_id } = req.body;
    
    const query = `
      UPDATE session_participants 
      SET 
        connection_status = 'offline',
        left_at = CURRENT_TIMESTAMP,
        is_active = false,
        websocket_id = NULL,
        last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1) 
      AND student_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, student_id]);
    
    // Broadcast participant count update
    const countQuery = `
      SELECT COUNT(*) as count FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.session_id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
    `;
    const countResult = await pool.query(countQuery, [sessionId]);
    
    broadcastToSession(sessionId, {
      type: 'participant-count-updated',
      count: parseInt(countResult.rows[0].count)
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update connection status
app.post('/api/sessions/:sessionId/update-connection', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { student_id, connection_status } = req.body;
    
    const query = `
      UPDATE session_participants 
      SET 
        connection_status = $3,
        last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1) 
      AND student_id = $2
      RETURNING *
    `;
    
    await pool.query(query, [sessionId, student_id, connection_status]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating connection status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update last activity
app.post('/api/sessions/:sessionId/update-activity', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { student_id } = req.body;
    
    const query = `
      UPDATE session_participants 
      SET last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1) 
      AND student_id = $2
      RETURNING *
    `;
    
    await pool.query(query, [sessionId, student_id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating last activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Automatic cleanup of inactive participants (runs every 5 minutes)
setInterval(async () => {
  try {
    const cleanupQuery = `
      UPDATE session_participants 
      SET 
        is_active = false,
        connection_status = 'offline'
      WHERE 
        last_activity < NOW() - INTERVAL '5 minutes' 
        AND is_active = true
        AND connection_status = 'online'
      RETURNING session_id
    `;
    
    const result = await pool.query(cleanupQuery);
    
    if (result.rows.length > 0) {
      console.log(`Cleaned up ${result.rows.length} inactive participants`);
      
      // Broadcast updates to affected sessions
      const sessionIds = [...new Set(result.rows.map(row => row.session_id))];
      
      for (const sessionId of sessionIds) {
        const countQuery = `
          SELECT s.session_id, COUNT(*) as count 
          FROM session_participants sp
          JOIN sessions s ON sp.session_id = s.id
          WHERE s.id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
          GROUP BY s.session_id
        `;
        const countResult = await pool.query(countQuery, [sessionId]);
        
        if (countResult.rows.length > 0) {
          broadcastToSession(countResult.rows[0].session_id, {
            type: 'participant-count-updated',
            count: parseInt(countResult.rows[0].count)
          });
        }
      }
    }
  } catch (error) {
    console.error('Error during automatic cleanup:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// AI Tutor endpoint (connects to your n8n workflow)
app.post('/api/tutor', async (req, res) => {
  try {
    const { question, mode } = req.body;
    
    if (!question || !mode) {
      return res.status(400).json({ error: 'Question and mode are required' });
    }

    console.log('Forwarding request to n8n:', `mode='${mode}'`);
    
    // Forward to n8n workflow
    const n8nResponse = await fetch('YOUR_N8N_WEBHOOK_URL_HERE', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: question,
        mode: mode,
      }),
    });

    if (!n8nResponse.ok) {
      throw new Error(`N8N request failed with status ${n8nResponse.status}`);
    }

    const result = await n8nResponse.json();
    res.json(result);
  } catch (error) {
    console.error('Error forwarding request to n8n:', error.message);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    websocket: {
      connections: Array.from(sessionConnections.entries()).map(([sessionId, connections]) => ({
        sessionId,
        connectionCount: connections.length
      }))
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Start server with WebSocket support
server.listen(PORT, () => {
  console.log(`Backend server with WebSocket is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    pool.end();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    pool.end();
  });
});

module.exports = { app, server, wss };
