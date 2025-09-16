const express = require('express');
const { passport } = require('../config/oauth-dynamic');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();

console.log('🔥 AUTH-DYNAMIC ROUTES LOADING...');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Helper function to validate SASTRA email domains
const validateSastraEmail = (email, role) => {
  if (role === 'teacher') {
    return email.endsWith('.sastra.edu') || email.endsWith('@sastra.edu');
  } else if (role === 'student') {
    return email.endsWith('@sastra.ac.in') && /^\d+@sastra\.ac\.in$/.test(email);
  }
  return false;
};

// Initiate Google OAuth2 authentication for teachers (@sastra.edu)
router.get('/google/edu', (req, res, next) => {
  console.log('🎯 Teacher OAuth route accessed!');
  console.log('Available strategies:', Object.keys(passport._strategies || {}));
  
  if (!passport._strategies['google-edu']) {
    console.error('❌ google-edu strategy not found!');
    return res.status(500).json({ error: 'Teacher OAuth strategy not configured' });
  }
  
  passport.authenticate('google-edu', {
    scope: ['profile', 'email']
  })(req, res, next);
});

// Initiate Google OAuth2 authentication for students (@sastra.ac.in)
router.get('/google/acin', (req, res, next) => {
  console.log('🎯 Student OAuth route accessed!');
  console.log('Available strategies:', Object.keys(passport._strategies || {}));
  
  if (!passport._strategies['google-acin']) {
    console.error('❌ google-acin strategy not found!');
    return res.status(500).json({ error: 'Student OAuth strategy not configured' });
  }
  
  passport.authenticate('google-acin', {
    scope: ['profile', 'email']
  })(req, res, next);
});

// Generic Google OAuth2 authentication (determines strategy based on role selection)
router.get('/google/:role?', (req, res, next) => {
  const role = req.params.role;
  console.log('Generic OAuth route accessed with role:', role);
  
  if (role === 'teacher') {
    // Redirect to teacher-specific OAuth
    return passport.authenticate('google-edu', {
      scope: ['profile', 'email']
    })(req, res, next);
  } else if (role === 'student') {
    // Redirect to student-specific OAuth
    return passport.authenticate('google-acin', {
      scope: ['profile', 'email']
    })(req, res, next);
  } else {
    // Default behavior - redirect to role selection
    return res.redirect('/auth?error=role_required');
  }
});

// OAuth2 callback for teachers (@sastra.edu)
router.get('/google/callback/edu', 
  passport.authenticate('google-edu', { failureRedirect: '/auth?error=oauth_failed' }),
  async (req, res) => {
    try {
      console.log('Teacher OAuth callback triggered');
      const user = req.user;
      console.log('Teacher user data:', user);
      
      // Enforce correct role for this callback
      if (user.role !== 'teacher') {
        console.log('Wrong portal: non-teacher hit teacher callback', user.email, 'role:', user.role);
        return res.redirect('/auth?error=wrong_portal');
      }
      
      // Validate email domain for role
      if (!validateSastraEmail(user.email, user.role)) {
        console.log('Invalid domain for teacher:', user.email);
        return res.redirect('/auth?error=invalid_domain');
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role,
          fullName: user.full_name
        },
        process.env.JWT_SECRET || 'your_jwt_secret_here',
        { expiresIn: '24h' }
      );

      console.log('Teacher JWT token generated, redirecting to frontend');
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }))}`);
    } catch (error) {
      console.error('OAuth callback error (EDU):', error);
      res.redirect('/auth?error=callback_failed');
    }
  }
);

// OAuth2 callback for students (@sastra.ac.in)
router.get('/google/callback/acin', 
  passport.authenticate('google-acin', { failureRedirect: '/auth?error=oauth_failed' }),
  async (req, res) => {
    try {
      console.log('Student OAuth callback triggered');
      const user = req.user;
      console.log('Student user data:', user);
      
      // Enforce correct role for this callback
      if (user.role !== 'student') {
        console.log('Wrong portal: non-student hit student callback', user.email, 'role:', user.role);
        return res.redirect('/auth?error=wrong_portal');
      }
      
      // Validate email domain for role
      if (!validateSastraEmail(user.email, user.role)) {
        console.log('Invalid domain for student:', user.email);
        return res.redirect('/auth?error=invalid_domain');
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role,
          fullName: user.full_name
        },
        process.env.JWT_SECRET || 'your_jwt_secret_here',
        { expiresIn: '24h' }
      );

      console.log('Student JWT token generated, redirecting to frontend');
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }))}`);
    } catch (error) {
      console.error('OAuth callback error (ACIN):', error);
      res.redirect('/auth?error=callback_failed');
    }
  }
);

// Verify JWT token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_here');
    
    // Get fresh user data from database
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_here');
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Check authentication status
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_here');
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.json({ authenticated: false });
    }

    res.json({ 
      authenticated: true,
      user: {
        id: userResult.rows[0].id,
        email: userResult.rows[0].email,
        role: userResult.rows[0].role
      }
    });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

console.log('Auth-dynamic routes configured successfully!');

module.exports = router;