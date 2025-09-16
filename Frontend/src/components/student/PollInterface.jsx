import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';

const PollInterface = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [activePoll, setActivePoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasResponded, setHasResponded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pollLoading, setPollLoading] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null); // Store submission result
  const [showResults, setShowResults] = useState(false); // Show correct answer after submission
  const [wsConnected, setWsConnected] = useState(false); // WebSocket connection status
  const [countdown, setCountdown] = useState(null); // Next poll countdown seconds
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

  // Use useRef to store the interval IDs and WebSocket to clear them properly
  const timerIntervalRef = useRef(null);
  const lastPollIdRef = useRef(null); // Track the last poll ID to prevent unnecessary updates
  const wsRef = useRef(null); // WebSocket reference

  // Function to clear all intervals and WebSocket
  const clearAllIntervals = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // Normalize poll object to ensure options is an array
  const normalizePoll = (p) => {
    if (!p) return p;
    let options = p.options;
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch (e) {
        // leave as-is if parsing fails
      }
    }
    return { ...p, options };
  };


  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      navigate('/auth');
      return;
    }
    fetchSession();
    
    // Initial check for active poll
    checkForActivePoll();
    
    
    // Setup WebSocket connection
    setupWebSocketConnection();
    
    // Cleanup intervals and WebSocket on component unmount
    return () => {
      clearAllIntervals();
    };
  }, [sessionId, currentUser, navigate]);

  useEffect(() => {
    if (activePoll && activePoll.time_limit && !hasResponded) {
      // Clear any existing timer before starting a new one
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      
      // Calculate initial timeLeft based on activated_at and time_limit
      const activatedTime = new Date(activePoll.activated_at).getTime();
      const now = new Date().getTime();
      const elapsedSeconds = Math.floor((now - activatedTime) / 1000);
      const remaining = activePoll.time_limit - elapsedSeconds;

      if (remaining <= 0) {
        setTimeLeft(0);
        // Poll is already expired, mark as responded to prevent interaction
        setHasResponded(true);
      } else {
        setTimeLeft(remaining);
        timerIntervalRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
              setHasResponded(true); // Mark as responded when time runs out
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else if (hasResponded || !activePoll) {
      // If responded or no active poll, clear the timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    // Cleanup timer when component unmounts or dependencies change
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [activePoll, hasResponded]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data);
      } else {
        alert('Session not found');
        navigate('/student/join');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocketConnection = () => {
    try {
      console.log('Setting up WebSocket connection for poll interface...');
      
      const ws = new WebSocket('ws://localhost:3001');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        
        // Join session
        if (currentUser && currentUser.id) {
          const normalizedSessionId = (sessionId ?? '').toString().toUpperCase();
          ws.send(JSON.stringify({
            type: 'join-session',
            sessionId: normalizedSessionId,
            studentId: currentUser.id
          }));
        }
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        
        switch (data.type) {
          case 'poll-activated': {
            // A new poll has been activated for this session
            console.log('Poll activated via WebSocket');
            const poll = normalizePoll(data.poll);

            // Proactively clear any existing timer to avoid overlap
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }

            // Update UI to new poll and reset state
            setActivePoll(poll);
            setHasResponded(false);
            setSelectedOption(null);
            setSubmissionResult(null);
            setShowResults(false);
            setCountdown(null);

            // Initialize timeLeft immediately from activated_at and time_limit
            try {
              if (poll && poll.time_limit && poll.activated_at) {
                const activatedTime = new Date(poll.activated_at).getTime();
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - activatedTime) / 1000);
                const remaining = Math.max(0, (poll.time_limit || 0) - (isNaN(elapsedSeconds) ? 0 : elapsedSeconds));
                setTimeLeft(remaining);
                if (remaining === 0) {
                  setHasResponded(true);
                }
              } else {
                // Fallback: set to configured time limit or 0
                setTimeLeft(poll?.time_limit || 0);
              }
            } catch (e) {
              console.warn('Failed to initialize timeLeft on activation:', e);
            }

            break;
          }
          case 'reveal-answers': {
            const incomingSessionId = (data.sessionId ?? '').toString().toUpperCase();
            const currentSessionId = (sessionId ?? '').toString().toUpperCase();
            if (incomingSessionId === currentSessionId) {
              const revealedPollId = data.pollId ?? data.poll?.id;
              const currentPollId = activePoll?.id;

              // Ignore stale reveals that don't match the currently active poll
              if (currentPollId && revealedPollId && revealedPollId !== currentPollId) {
                console.log('Ignoring reveal for a different poll:', { revealedPollId, currentPollId });
                break;
              }

              console.log('Answer reveal received, showing results');
              if (!activePoll && data.poll) {
                // If no active poll set (e.g., deactivated already), keep the reveal context for display
                setActivePoll(normalizePoll(data.poll));
              }
              setShowResults(true);
            }
            break;
          }
          case 'poll-deactivated': {
            const incomingSessionId = (data.sessionId ?? '').toString().toUpperCase();
            const currentSessionId = (sessionId ?? '').toString().toUpperCase();
            // Poll ended; clear current poll (fallback to polling or wait for next activation)
            if (incomingSessionId === currentSessionId) {
              console.log('Poll deactivated via WebSocket');
              setActivePoll(null);
              setHasResponded(false);
              setSelectedOption(null);
              setSubmissionResult(null);
              setShowResults(false);
            }
            break;
          }
          case 'next-poll-countdown':
            setCountdown(typeof data.seconds === 'number' ? data.seconds : null);
            break;
          default:
            console.log('Unhandled message type:', data.type);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          setupWebSocketConnection();
        }, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };
      
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      setWsConnected(false);
    }
  };

  const checkForActivePoll = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/active-poll`);
      if (response.ok) {
        const poll = await response.json();
        
        // Only update if it's a new poll or the existing one has changed
        if (!activePoll || activePoll.id !== poll.id) {
          setActivePoll(normalizePoll(poll));
          setHasResponded(false); // Reset response status for new poll
          setSelectedOption(null);
          setSubmissionResult(null); // Reset submission result
          setShowResults(false); // Reset results display
          lastPollIdRef.current = poll.id; // Update last poll ID
        }
      } else {
        // No active poll, clear current poll state only if we had one
        if (activePoll) {
          setActivePoll(null);
          setHasResponded(false);
          setSelectedOption(null);
          setSubmissionResult(null); // Reset submission result
          setShowResults(false); // Reset results display
          lastPollIdRef.current = null;
        }
      }
    } catch (error) {
      // No active poll or error - this is normal, just ensure state is cleared
      if (activePoll) {
        setActivePoll(null);
        setHasResponded(false);
        setSelectedOption(null);
        setSubmissionResult(null); // Reset submission result
        setShowResults(false); // Reset results display
        lastPollIdRef.current = null;
      }
    }
  };

  const submitResponse = async () => {
    if (selectedOption === null || hasResponded || pollLoading) return;

    setPollLoading(true);
    try {
      const responseTime = activePoll.time_limit - timeLeft;
      const response = await fetch(`http://localhost:3001/api/polls/${activePoll.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: currentUser.id,
          selected_option: selectedOption,
          response_time: responseTime,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setHasResponded(true);
        setSubmissionResult(result.data); // Store the submission result
        // Don't show results immediately - wait for WebSocket reveal
        
        // Stop the timer immediately after successful submission
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        
        // Show waiting message instead of immediate result
        alert('Response submitted! Waiting for other participants...');
      } else {
        const error = await response.json();
        if (error.error === 'Already responded to this poll') {
          setHasResponded(true);
          alert('You have already responded to this poll.');
        } else {
          alert('Error submitting response: ' + error.error);
        }
      }
    } catch (error) {
      console.error('Error submitting response:', error);
      alert('Error submitting response. Please try again.');
    } finally {
      setPollLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOptionColor = (index) => {
    if (!showResults) {
      return selectedOption === index
        ? 'border-primary-500 bg-primary-50'
        : 'border-gray-200 hover:border-gray-300';
    }

    // Show results after submission
    if (activePoll.correct_answer === index) {
      return 'border-green-500 bg-green-50'; // Correct answer in green
    }
    
    if (submissionResult && selectedOption === index && index !== activePoll.correct_answer) {
      return 'border-red-500 bg-red-50'; // User's wrong answer in red
    }

    return 'border-gray-200 bg-gray-50'; // Other options in gray
  };

  if (loading) {
    return <LoadingSpinner text="Loading session..." />;
  }

  if (!session) {
    return <div>Session not found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Session Header */}
      <div className="card mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{session.title}</h1>
            <p className="text-gray-600">{session.course_name}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary-600">ID: {session.session_id}</div>
            <button
              onClick={() => navigate(`/student/session/${sessionId}/resources`)}
              className="btn-secondary text-sm mt-2"
            >
              View Resources
            </button>
          </div>
        </div>
      </div>

      {/* Countdown banner */}
      {countdown != null && (
        <div className="card mb-4">
          <div className="text-center text-gray-800">
            Poll starting in <span className="font-bold">{countdown}</span>...
          </div>
        </div>
      )}

      {/* Poll Interface */}
      {activePoll ? (
        <div className="card">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Live Poll</h2>
            {timeLeft > 0 && !hasResponded && (
              <div className="text-right">
                <div className="text-2xl font-bold text-red-600">{formatTime(timeLeft)}</div>
                <div className="text-sm text-gray-500">Time remaining</div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-4">{activePoll.question}</h3>
            
            <div className="space-y-3">
              {activePoll.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => !hasResponded && !pollLoading && timeLeft > 0 && setSelectedOption(index)}
                  disabled={hasResponded || timeLeft === 0 || pollLoading}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${getOptionColor(index)} ${
                    hasResponded || timeLeft === 0 || pollLoading
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-700 mr-3">
                        {String.fromCharCode(65 + index)}.
                      </span>
                      <span className="text-gray-800">{option}</span>
                    </div>
                    {showResults && (
                      <div className="flex items-center space-x-2">
                        {activePoll.correct_answer === index && (
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {submissionResult && selectedOption === index && index !== activePoll.correct_answer && (
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {!hasResponded && timeLeft > 0 && (
            <button
              onClick={submitResponse}
              disabled={selectedOption === null || pollLoading}
              className="btn-primary w-full py-3"
            >
              {pollLoading ? 'Submitting...' : 'Submit Response'}
            </button>
          )}

          {hasResponded && !showResults && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-blue-800 font-medium">Response submitted! Waiting for other participants...</span>
              </div>
              <div className="mt-2 text-sm text-blue-700">
                Results will be shown when everyone has responded or time expires.
              </div>
            </div>
          )}

          {submissionResult && showResults && (
            <div className={`border rounded-lg p-4 ${
              submissionResult && submissionResult.is_correct 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <svg className={`h-5 w-5 mr-2 ${
                  submissionResult && submissionResult.is_correct 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {submissionResult && submissionResult.is_correct ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  )}
                </svg>
                <span className={`font-medium ${
                  submissionResult && submissionResult.is_correct 
                    ? 'text-green-800' 
                    : 'text-red-800'
                }`}>
                  {submissionResult && submissionResult.is_correct 
                    ? 'Correct! Well done!' 
                    : 'Incorrect, but good try!'}
                </span>
              </div>
              {showResults && (
                <div className={`mt-3 text-sm ${
                  submissionResult && submissionResult.is_correct 
                    ? 'text-green-700' 
                    : 'text-red-700'
                }`}>
                  <strong>Correct Answer:</strong> {String.fromCharCode(65 + activePoll.correct_answer)}. {activePoll.options[activePoll.correct_answer]}
                </div>
              )}
              {activePoll.justification && (
                <div className={`mt-3 text-sm ${
                  submissionResult && submissionResult.is_correct 
                    ? 'text-green-700' 
                    : 'text-red-700'
                }`}>
                  <strong>Explanation:</strong> {activePoll.justification}
                </div>
              )}
            </div>
          )}

          {timeLeft === 0 && !hasResponded && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <span className="text-red-800 font-medium">Time's up! You can no longer respond to this poll.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Waiting for the next poll...</h3>
          <p className="text-gray-500">Your teacher will send polls during the session. Stay tuned!</p>
        </div>
      )}

      <div className="mt-6 text-center">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="text-primary-600 hover:text-primary-800 text-sm"
        >
          ← Back to dashboard
        </button>
      </div>
    </div>
  );
};

export default PollInterface;