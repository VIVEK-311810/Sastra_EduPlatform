// API configuration for the Educational Platform
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const AUTH_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Generic API request function with error handling and authentication
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Add authentication token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    
    // Handle authentication errors
    if (response.status === 401) {
      // Token expired or invalid, clear local storage and redirect to login
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = '/auth';
      throw new Error('Authentication required');
    }
    
    if (response.status === 403) {
      throw new Error('Access denied. Insufficient permissions.');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
};

// Authentication API functions
export const authAPI = {
  // Initiate OAuth2 login
  initiateLogin: () => {
    window.location.href = `${AUTH_BASE_URL}/auth/google`;
  },
  
  // Verify token
  verifyToken: (token) =>
    fetch(`${AUTH_BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    }).then(res => res.json()),
  
  // Get current user info
  getCurrentUser: () =>
    apiRequest('/auth/me'),
  
  // Logout
  logout: () =>
    fetch(`${AUTH_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    }).then(res => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      return res.json();
    }),
  
  // Check authentication status
  checkAuthStatus: () =>
    fetch(`${AUTH_BASE_URL}/auth/status`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    }).then(res => res.json()),
};

// Student API functions
export const studentAPI = {
  // Get student dashboard summary
  getDashboardSummary: (studentId) => 
    apiRequest(`/students/${studentId}/dashboard-summary`),
  
  // Get student sessions
  getSessions: (studentId) => 
    apiRequest(`/students/${studentId}/sessions`),
  
  // Get student activity
  getActivity: (studentId, limit = 20) => 
    apiRequest(`/students/${studentId}/activity?limit=${limit}`),
  
  // Get student statistics
  getStats: (studentId) => 
    apiRequest(`/students/${studentId}/stats`),
  
  // Get active polls
  getActivePolls: (studentId) => 
    apiRequest(`/students/${studentId}/active-polls`),
  
  // Submit poll response
  submitPollResponse: (studentId, pollId, selectedOption, responseTime) =>
    apiRequest(`/students/${studentId}/polls/${pollId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        selected_option: selectedOption,
        response_time: responseTime,
      }),
    }),
  
  // Get student performance
  getPerformance: (studentId) => 
    apiRequest(`/students/${studentId}/performance`),
  
  // Get recent polls
  getRecentPolls: (studentId, limit = 10) => 
    apiRequest(`/students/${studentId}/recent-polls?limit=${limit}`),
  
  // Get student profile
  getProfile: (studentId) => 
    apiRequest(`/students/${studentId}/profile`),
};

// Session API functions
export const sessionAPI = {
  // Join a session
  joinSession: (sessionId, studentId) =>
    apiRequest(`/sessions/${sessionId}/join`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),
  
  // Get session details
  getSession: (sessionId) => 
    apiRequest(`/sessions/${sessionId}`),
  
  // Get session participants
  getParticipants: (sessionId) => 
    apiRequest(`/sessions/${sessionId}/participants`),
  
  // Create new session (teacher only)
  createSession: (sessionData) =>
    apiRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    }),
  
  // Get teacher sessions
  getTeacherSessions: (teacherId) =>
    apiRequest(`/sessions/teacher/${teacherId}`),
};

// Poll API functions
export const pollAPI = {
  // Get poll details
  getPoll: (pollId) => 
    apiRequest(`/polls/${pollId}`),
  
  // Get poll results
  getPollResults: (pollId) => 
    apiRequest(`/polls/${pollId}/results`),
  
  // Create new poll (teacher only)
  createPoll: (pollData) =>
    apiRequest('/polls', {
      method: 'POST',
      body: JSON.stringify(pollData),
    }),
  
  // Activate poll (teacher only)
  activatePoll: (pollId) =>
    apiRequest(`/polls/${pollId}/activate`, {
      method: 'PUT',
    }),
  
  // Close poll (teacher only)
  closePoll: (pollId) =>
    apiRequest(`/polls/${pollId}/close`, {
      method: 'PUT',
    }),
};

// Utility functions
export const utils = {
  // Check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    return !!(token && user);
  },
  
  // Get current user from localStorage
  getCurrentUser: () => {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
  },
  
  // Validate SASTRA domain
  validateSastraEmail: (email, role) => {
    if (role === 'teacher') {
      return email.endsWith('@sastra.edu');
    } else if (role === 'student') {
      return email.endsWith('@sastra.ac.in') && /^\d+@sastra\.ac\.in$/.test(email);
    }
    return false;
  },
};

export default {
  authAPI,
  studentAPI,
  sessionAPI,
  pollAPI,
  utils,
  apiRequest,
};

