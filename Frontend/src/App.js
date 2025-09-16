import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

// Auth Components
import RoleSelection from './components/auth/RoleSelection';
import OAuth2Callback from './components/auth/OAuth2Callback';

// Teacher Components
import EnhancedTeacherDashboard from './components/teacher/EnhancedTeacherDashboard';
import CreateSession from './components/teacher/CreateSession';
import EnhancedSessionManagement from './components/teacher/EnhancedSessionManagement';

// Student Components
import EnhancedStudentDashboard from './components/student/EnhancedStudentDashboard';
import EnhancedStudentSession from './components/student/EnhancedStudentSession';
import JoinSession from './components/student/JoinSession';
import PollInterface from './components/student/PollInterface';
import SessionResources from './components/student/SessionResources';
import AIAssistant from './components/student/AIAssistant';

// Shared Components
import Header from './components/shared/Header';
import SessionHistory from './components/shared/SessionHistory';
import SessionResourcesShared from './components/shared/SessionResources';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            {/* Default route */}
            <Route path="/" element={<Navigate to="/auth" replace />} />
            
            {/* Authentication routes */}
            <Route path="/auth" element={<RoleSelection />} />
            <Route path="/auth/callback" element={<OAuth2Callback />} />
            
            {/* Teacher routes */}
            <Route path="/teacher/dashboard" element={<EnhancedTeacherDashboard />} />
            <Route path="/teacher/create-session" element={<CreateSession />} />
            <Route path="/teacher/session/:sessionId" element={<EnhancedSessionManagement />} />
            
            {/* Student routes */}
            <Route path="/student/dashboard" element={<EnhancedStudentDashboard />} />
            <Route path="/student/join" element={<JoinSession />} />
            <Route path="/student/session/:sessionId" element={<EnhancedStudentSession />} />
            <Route path="/student/session/:sessionId/original" element={<PollInterface />} />
            <Route path="/student/session/:sessionId/resources" element={<SessionResources />} />
            <Route path="/student/ai-assistant" element={<AIAssistant />} />
            
            {/* Shared routes */}
            <Route path="/session-history" element={<SessionHistory />} />
            <Route path="/session/:sessionId/resources" element={<SessionResourcesShared />} />
            
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

