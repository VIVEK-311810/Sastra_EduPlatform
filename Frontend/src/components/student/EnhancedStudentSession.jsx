import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';

const EnhancedStudentSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePoll, setActivePoll] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [pollResults, setPollResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]);
  const [ws, setWs] = useState(null);

  // Debug logging for sessionId extraction
  useEffect(() => {
    console.log('=== SESSION ID DEBUG ===');
    console.log('useParams sessionId:', sessionId);
    console.log('Current URL:', window.location.href);
    console.log('Location pathname:', location.pathname);
    console.log('URL params:', new URLSearchParams(window.location.search));
    
    // Extract sessionId from URL manually as backup
    const pathParts = location.pathname.split('/');
    const sessionIdFromPath = pathParts[pathParts.length - 1];
    console.log('SessionId from path:', sessionIdFromPath);
    console.log('========================');
  }, [sessionId, location]);

  useEffect(() => {
    console.log('Component mounted with sessionId:', sessionId);
    
    // Enhanced sessionId validation
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      console.error('Invalid sessionId detected:', sessionId);
      console.log('Attempting to extract sessionId from URL...');
      
      // Try to extract sessionId from URL path
      const pathParts = location.pathname.split('/');
      const extractedSessionId = pathParts[pathParts.length - 1];
      
      if (extractedSessionId && extractedSessionId !== 'undefined' && extractedSessionId !== 'null') {
        console.log('Found sessionId in URL path:', extractedSessionId);
        // Force re-navigation with correct sessionId
        navigate(`/student/session/${extractedSessionId}`, { replace: true });
        return;
      } else {
        console.error('Could not extract valid sessionId from URL, redirecting to dashboard');
        navigate('/student/dashboard');
        return;
      }
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'student') {
      console.error('Invalid user or role, redirecting to auth');
      navigate('/auth');
      return;
    }

    console.log('Loading session:', sessionId, 'for user:', currentUser.id);
    fetchSession();
    joinSession();
    setupWebSocketConnection();

    // Cleanup function
    return () => {
      if (ws) {
        console.log('Cleaning up WebSocket connection');
        ws.close();
      }
    };
  }, [sessionId, navigate, location]);

  useEffect(() => {
    let timer;
    if (activePoll && timeRemaining > 0 && !hasAnswered) {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activePoll, timeRemaining, hasAnswered]);

  const fetchSession = async () => {
    try {
      console.log('Fetching session data for:', sessionId);
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Session data received:', data);
        setSession(data);
        setConnectionStatus('connected');
        fetchParticipants();
      } else {
        console.error('Session not found:', response.status);
        setSession(null);
        setConnectionStatus('error');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      setSession(null);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const joinSession = async () => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      
      if (!currentUser || !currentUser.id) {
        console.error('No valid user found, redirecting to auth');
        navigate('/auth');
        return;
      }
      
      const studentId = currentUser.id;
      console.log('Joining session:', sessionId, 'as student:', studentId);
      
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: studentId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Successfully joined session:', data);
      } else {
        const errorData = await response.text();
        console.error('Failed to join session:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error joining session:', error);
    }
  };

  const fetchParticipants = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/participants`);
      if (response.ok) {
        const data = await response.json();
        console.log('Participants data:', data);
        // Ensure participants is always an array
        setParticipants(Array.isArray(data) ? data : (data.participants || []));
      } else {
        console.error('Failed to fetch participants:', response.status);
        setParticipants([]);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      setParticipants([]);
    }
  };

  const leaveSession = async () => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      
      if (currentUser && currentUser.id) {
        const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/leave`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: currentUser.id,
          }),
        });

        if (response.ok) {
          console.log('Successfully left session');
        } else {
          console.error('Failed to leave session:', response.status);
        }
      }
    } catch (error) {
      console.error('Error leaving session:', error);
    } finally {
      // Close WebSocket connection
      if (ws) {
        ws.close();
      }
      // Navigate to dashboard regardless of API success
      navigate('/student/dashboard');
    }
  };

  const setupWebSocketConnection = () => {
    console.log('=== WEBSOCKET SETUP DEBUG ===');
    console.log('Setting up WebSocket for session:', sessionId);
    console.log('SessionId type:', typeof sessionId);
    console.log('SessionId value:', JSON.stringify(sessionId));
    
    // Enhanced sessionId validation before WebSocket setup
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId.trim() === '') {
      console.error('Cannot setup WebSocket: sessionId is invalid:', sessionId);
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || !currentUser.id) {
      console.error('Cannot setup WebSocket: no valid user found');
      return;
    }

    console.log('Creating WebSocket connection...');
    // Create WebSocket connection
    const websocket = new WebSocket('ws://localhost:3001');
    
    websocket.onopen = () => {
      console.log('WebSocket connected successfully');
      setConnectionStatus('connected');
      
      // Send join message with validated sessionId
      const joinMessage = {
        type: 'join-session',
        sessionId: sessionId.toString(), // Ensure it's a string
        studentId: currentUser.id
      };
      
      console.log('Sending WebSocket join message:', joinMessage);
      websocket.send(JSON.stringify(joinMessage));
      
      // Update connection status in database
      updateConnectionStatus('online');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      
      switch (data.type) {
        case 'poll-activated':
          setActivePoll(data.poll);
          setTimeRemaining(data.poll.timeLimit || 60);
          setHasAnswered(false);
          setSelectedAnswer(null);
          setShowResults(false);
          setPollResults(null); // Reset poll results for new poll
          break;
          
        case 'poll-deactivated':
          setActivePoll(null);
          break;
          
        case 'poll-results':
          setPollResults(data.results);
          setShowResults(true);
          break;
          
        case 'reveal-answers':
          if (data.sessionId === sessionId) {
            console.log('Answer reveal received, showing results');
            setPollResults({
              correctAnswer: data.correctAnswer,
              userAnswer: selectedAnswer,
              poll: data.poll
            });
            setShowResults(true);
          }
          break;
          
        case 'participant-count-updated':
          console.log('Participant count updated, refreshing list');
          fetchParticipants();
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
      updateConnectionStatus('offline');
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      updateConnectionStatus('offline');
    };

    // Store WebSocket reference
    setWs(websocket);

    // Set up heartbeat to maintain connection and update activity
    const heartbeatInterval = setInterval(() => {
      if (websocket.readyState === WebSocket.OPEN) {
        const heartbeatMessage = {
          type: 'heartbeat',
          sessionId: sessionId.toString(), // Ensure it's a string
          studentId: currentUser.id
        };
        console.log('Sending heartbeat:', heartbeatMessage);
        websocket.send(JSON.stringify(heartbeatMessage));
        updateLastActivity();
      }
    }, 30000); // Every 30 seconds

    // Cleanup interval when component unmounts
    return () => {
      clearInterval(heartbeatInterval);
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  };

  const updateConnectionStatus = async (status) => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      if (currentUser && currentUser.id) {
        await fetch(`http://localhost:3001/api/sessions/${sessionId}/update-connection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: currentUser.id,
            connection_status: status,
          }),
        });
      }
    } catch (error) {
      console.error('Error updating connection status:', error);
    }
  };

  const updateLastActivity = async () => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      if (currentUser && currentUser.id) {
        await fetch(`http://localhost:3001/api/sessions/${sessionId}/update-activity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: currentUser.id,
          }),
        });
      }
    } catch (error) {
      console.error('Error updating last activity:', error);
    }
  };

  const handleAnswerSubmit = async () => {
    if (selectedAnswer === null) return;

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      
      if (!currentUser || !currentUser.id) {
        console.error('No valid user found for answer submission');
        return;
      }
      
      const response = await fetch(`http://localhost:3001/api/polls/${activePoll.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: currentUser.id,
          selected_option: selectedAnswer,
          response_time: activePoll.time_limit - timeRemaining,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setHasAnswered(true);
        
        // Store submission result but don't show results immediately
        // Wait for WebSocket reveal message
        
        console.log('Answer submitted successfully');
        updateLastActivity();
      } else {
        console.error('Failed to submit answer:', response.status);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const handleTimeUp = () => {
    if (!hasAnswered) {
      setHasAnswered(true);
      console.log('Time up for poll');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOptionColor = (index) => {
    if (!showResults) {
      return selectedAnswer === index 
        ? 'bg-blue-100 border-blue-500 text-blue-900' 
        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
    }

    if (pollResults && pollResults.correctAnswer === index) {
      return 'bg-green-100 border-green-500 text-green-900';
    }
    
    if (pollResults && pollResults.userAnswer === index && index !== pollResults.correctAnswer) {
      return 'bg-red-100 border-red-500 text-red-900';
    }

    return 'bg-gray-50 border-gray-300 text-gray-600';
  };

  if (loading) {
    return <LoadingSpinner text="Joining session..." />;
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-xl font-semibold text-red-800 mb-2">Session Not Found</h2>
          <p className="text-red-600 mb-4">The session you're trying to join doesn't exist or has ended.</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Session Header */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
            <p className="text-gray-600 mt-1">{session.course_name}</p>
            <p className="text-sm text-gray-500 mt-2">Teacher: {session.teacher_name || 'Loading...'}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{session.session_id}</div>
                <div className="text-xs text-gray-500">Session ID</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionStatus === 'connected' ? '🟢' : '🔴'}
                </div>
                <div className="text-xs text-gray-500">
                  {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-600">
                  {Array.isArray(participants) ? participants.filter(p => p.is_active).length : 0}
                </div>
                <div className="text-xs text-gray-500">Online</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Poll */}
      {activePoll ? (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-gray-900">Live Poll</h2>
            {!hasAnswered && timeRemaining > 0 && (
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`font-bold ${timeRemaining <= 10 ? 'text-red-600' : 'text-orange-600'}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{activePoll.question}</h3>
            
            <div className="space-y-3">
              {activePoll.options && activePoll.options.map((option, index) => (
                <div key={index} className="relative">
                  <button
                    onClick={() => !hasAnswered && setSelectedAnswer(index)}
                    disabled={hasAnswered}
                    className={`w-full text-left p-4 border-2 rounded-lg transition-all duration-200 ${getOptionColor(index)} ${
                      hasAnswered ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="font-medium">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        <span>{option}</span>
                      </div>
                      {showResults && pollResults && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">
                            {pollResults.distribution && pollResults.distribution[index] ? pollResults.distribution[index] : 0}%
                          </span>
                          {pollResults.correctAnswer === index && (
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                    {showResults && pollResults && pollResults.distribution && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              pollResults.correctAnswer === index ? 'bg-green-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${pollResults.distribution[index] || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {!hasAnswered && selectedAnswer !== null && (
            <button
              onClick={handleAnswerSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
            >
              Submit Answer
            </button>
          )}

          {hasAnswered && !showResults && (
            <div className="text-center py-4">
              <div className="inline-flex items-center space-x-2 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Answer submitted! Waiting for other participants...</span>
              </div>
              <div className="mt-2 text-sm text-blue-600">
                Results will be shown when everyone has responded or time expires.
              </div>
            </div>
          )}

          {hasAnswered && showResults && (
            <div className="text-center py-4">
              <div className="inline-flex items-center space-x-2 text-green-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Results revealed!</span>
              </div>
            </div>
          )}

          {showResults && activePoll.justification && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Explanation:</h4>
              <p className="text-blue-800">{activePoll.justification}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Waiting for Poll</h3>
          <p className="text-gray-600">Your teacher will start a poll soon. Stay connected!</p>
        </div>
      )}

      {/* Session Controls */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Session Controls</h3>
            <p className="text-sm text-gray-600">Manage your session participation</p>
          </div>
          <button
            onClick={leaveSession}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Leave Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedStudentSession;