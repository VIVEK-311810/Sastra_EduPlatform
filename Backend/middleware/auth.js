const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        
        // Get user from database using the custom ID system
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid token. User not found.' });
        }

        const user = userResult.rows[0];
        
        // Validate SASTRA domain restrictions
        const isValidTeacher = user.role === 'teacher' && user.email.endsWith('@sastra.edu');
        const isValidStudent = user.role === 'student' && user.email.endsWith('@sastra.ac.in');
        
        if (!isValidTeacher && !isValidStudent) {
            return res.status(403).json({ message: 'Access denied. Invalid domain for user role.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token format.' });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired.' });
        }
        res.status(401).json({ message: 'Authentication failed.' });
    }
};

const authorize = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        
        if (req.user.role !== role) {
            return res.status(403).json({ message: `Access denied. ${role} role required.` });
        }
        next();
    };
};

// Middleware to validate SASTRA domain
const validateSastraDomain = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    
    const { email, role } = req.user;
    const isValidTeacher = role === 'teacher' && email.endsWith('@sastra.edu');
    const isValidStudent = role === 'student' && email.endsWith('@sastra.ac.in');
    
    if (!isValidTeacher && !isValidStudent) {
        return res.status(403).json({ 
            message: 'Access denied. Only @sastra.edu (teachers) and @sastra.ac.in (students) domains are allowed.' 
        });
    }
    
    next();
};

module.exports = { authenticate, authorize, validateSastraDomain };

