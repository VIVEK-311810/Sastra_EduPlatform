import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';
import GeneratedMCQs from './GeneratedMCQs';

const EnhancedSessionManagement = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [participants, setParticipants] = useState([]);
  const [generatedMCQs, setGeneratedMCQs] = useState([]);
  const [polls, setPolls] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [newPoll, setNewPoll] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    justification: '',
    timeLimit: 60
  });
  const [editingMCQ, setEditingMCQ] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  
  // WebSocket reference
  const wsRef = useRef(null);

  // Debug log for participants
  console.log('Participants type:', typeof participants, 'Value:', participants, 'IsArray:', Array.isArray(participants));

  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser || currentUser.role !== 'teacher') {
      navigate('/auth');
      return;
    }
    
    fetchSession();
    fetchParticipants();
    fetchPolls();
    fetchGeneratedMCQs();
    setupWebSocketConnection();
    
    // Cleanup WebSocket on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId, navigate]);

  const setupWebSocketConnection = () => {
    try {
      console.log('Setting up teacher WebSocket connection...');
      
      const ws = new WebSocket('ws://localhost:3001');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('Teacher WebSocket connected');
        setWsConnected(true);
        
        // Store reference globally for easy access
        window.socket = ws;
        
        // Join session as teacher (optional, for receiving updates)
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (currentUser && currentUser.id) {
          ws.send(JSON.stringify({
            type: 'join-session',
            sessionId: sessionId,
            studentId: currentUser.id, // Using teacher ID
            role: 'teacher'
          }));
        }
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Teacher WebSocket message received:', data);
        
        switch (data.type) {
          case 'participant-count-updated':
            fetchParticipants();
            break;
          case 'poll-response':
            // Handle poll responses if needed
            console.log('Poll response received:', data);
            break;
          case 'poll-activated':
            // Update active poll when queue auto-activates
            setActivePoll(data.poll);
            break;
          case 'mcqs-generated':
            // Real-time update when new MCQs are generated
            if (data.sessionId === sessionId) {
              console.log(`${data.count} new MCQs generated for this session`);
              fetchGeneratedMCQs(); // Refresh the MCQs list
              // Show notification if user is not on Generated MCQs tab
              if (activeTab !== 'generated-mcqs') {
                // You could add a toast notification here
                console.log('New MCQs available! Check the Generated MCQs tab.');
              }
            }
            break;
          case 'mcqs-sent':
            // Real-time update when MCQs are sent to queue
            if (data.sessionId === sessionId) {
              console.log(`${data.count} MCQs sent to queue`);
              fetchGeneratedMCQs(); // Refresh to remove sent MCQs
              fetchPolls(); // Refresh polls to show new ones
            }
            break;
          default:
            console.log('Unhandled message type:', data.type);
        }
      };
      
      ws.onclose = () => {
        console.log('Teacher WebSocket disconnected');
        setWsConnected(false);
        window.socket = null;
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          console.log('Attempting to reconnect teacher WebSocket...');
          setupWebSocketConnection();
        }, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('Teacher WebSocket error:', error);
        setWsConnected(false);
      };
      
    } catch (error) {
      console.error('Error setting up teacher WebSocket:', error);
      setWsConnected(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const fetchSession = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data);
      } else {
        alert('Session not found');
        navigate('/teacher/dashboard');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipants = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/participants`);
      if (response.ok) {
        const data = await response.json();
        // Ensure data is always an array
        console.log('Fetched participants data:', data);
        setParticipants(Array.isArray(data) ? data : (data.participants || []));
      } else {
        console.error('Failed to fetch participants');
        setParticipants([]);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      setParticipants([]); // Always fallback to empty array
    }
  };

  const fetchPolls = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/polls`);
      if (response.ok) {
        const data = await response.json();
        // Handle both direct array and object with polls property
        const polls = data.polls || data;
        const normalized = Array.isArray(polls) ? polls.map(p => ({
          ...p,
          correctAnswer: p.correctAnswer !== undefined ? p.correctAnswer : p.correct_answer,
          createdAt: p.createdAt || p.created_at,
          isActive: p.isActive !== undefined ? p.isActive : p.is_active,
          options: Array.isArray(p.options) ? p.options : (typeof p.options === 'string' ? JSON.parse(p.options) : p.options),
        })) : [];
        setPolls(normalized);
      } else {
        console.error('Failed to fetch polls:', response.status);
        setPolls([]);
      }
    } catch (error) {
      console.error('Error fetching polls:', error);
      setPolls([]);
    }
  };

  const fetchGeneratedMCQs = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${sessionId}/generated-mcqs`);
      if (response.ok) {
        const data = await response.json();
        // Handle both direct array and object with mcqs property
        const mcqs = data.mcqs || data;
        setGeneratedMCQs(Array.isArray(mcqs) ? mcqs : []);
      } else {
        console.error('Failed to fetch generated MCQs:', response.status);
        setGeneratedMCQs([]);
      }
    } catch (error) {
      console.error('Error fetching generated MCQs:', error);
      setGeneratedMCQs([]);
    }
  };

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3001/api/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          question: newPoll.question,
          options: newPoll.options.filter(opt => opt.trim() !== ''),
          correct_answer: newPoll.correctAnswer,
          justification: newPoll.justification,
          time_limit: newPoll.timeLimit
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Poll created and added to queue:', data);
        
        // Reset form
        setNewPoll({
          question: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          justification: '',
          timeLimit: 60
        });
        
        alert('Poll created and added to queue! If queue was empty, it will be sent automatically.');
        
        // Refresh session data
        fetchSession();
        
        // Refresh polls list to show the newly created poll
        fetchPolls();
        
        // Check if this should be sent immediately (if queue was empty)
        checkAndSendNextPoll();
        
      } else {
        const errorData = await response.json();
        console.error('Failed to create poll:', errorData);
        alert('Failed to create poll: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating poll:', error);
      alert('Error creating poll');
    }
  };

  const checkAndSendNextPoll = async () => {
    try {
      // Check if there are any active polls
      const activeResponse = await fetch(`http://localhost:3001/api/sessions/${sessionId}/active-poll`);
      
      if (activeResponse.status === 404) {
        // No active poll, send the next one from queue
        const queueResponse = await fetch(`http://localhost:3001/api/sessions/${sessionId}/poll-queue`);
        
        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          
          if (queueData.queue && queueData.queue.length > 0) {
            // Send the first queued poll
            const nextPoll = queueData.queue.find(p => p.queue_status === 'queued') || queueData.queue[0];
            await activatePoll(nextPoll);
          }
        }
      }
    } catch (error) {
      console.error('Error checking poll queue:', error);
    }
  };

  const activatePoll = async (poll) => {
    try {
      console.log('Activating poll:', poll);
      
      const response = await fetch(`http://localhost:3001/api/polls/${poll.id}/activate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const activatedPoll = await response.json();
        console.log('Poll activated successfully:', activatedPoll);
        
        // Update local state
        setActivePoll(activatedPoll);
        setPolls(polls.map(p => ({
          ...p,
          isActive: p.id === poll.id
        })));
        
        // FIXED: Enhanced WebSocket broadcasting with better error handling
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const message = {
            type: 'activate-poll',
            sessionId: sessionId,
            poll: activatedPoll
          };
          
          console.log('Sending WebSocket message:', message);
          wsRef.current.send(JSON.stringify(message));
          console.log('Poll broadcast via WebSocket successfully');
          
          alert('Poll activated and sent to students via WebSocket!');
        } else {
          console.warn('WebSocket not connected. Connection status:', wsConnected);
          console.warn('WebSocket state:', wsRef.current?.readyState);
          
          // Still show success for API call, but warn about WebSocket
          alert('Poll activated in database, but WebSocket connection issue detected. Students may not receive real-time notification.');
        }
      } else {
        const error = await response.json();
        console.error('Failed to activate poll:', error);
        alert('Failed to activate poll: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error activating poll:', error);
      alert('Error activating poll: ' + error.message);
    }
  };

  const handleDeactivatePoll = async (pollId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/polls/${pollId}/close`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setPolls(polls.map(poll => ({
          ...poll,
          isActive: false
        })));
        setActivePoll(null);
        
        // Broadcast poll deactivation via WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'poll-deactivated',
            sessionId: sessionId,
            pollId: pollId
          }));
        }
        
        alert('Poll deactivated.');
      } else {
        const error = await response.json();
        console.error('Failed to deactivate poll:', error);
        alert('Failed to deactivate poll: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deactivating poll:', error);
      alert('Error deactivating poll');
    }
  };

  const updatePollOption = (index, value) => {
    const updatedOptions = [...newPoll.options];
    updatedOptions[index] = value;
    setNewPoll({ ...newPoll, options: updatedOptions });
  };

  const handleSendSelectedMCQs = async (mcqIds) => {
  alert('MCQ sending has been moved to the Generated MCQs tab. Please use the "Activate" button there for direct activation.');
  setActiveTab('generated-mcqs');
  };

  const handleEditMCQ = (mcq) => {
    setEditingMCQ({
      id: mcq.id,
      question: mcq.question,
      options: Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options),
      correctAnswer: mcq.correct_answer,
      justification: mcq.justification || '',
      timeLimit: mcq.time_limit || 60
    });
    setShowEditModal(true);
  };

  const handleUpdateMCQ = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/generated-mcqs/${editingMCQ.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editingMCQ.question,
          options: editingMCQ.options,
          correct_answer: editingMCQ.correctAnswer,
          justification: editingMCQ.justification,
          time_limit: editingMCQ.timeLimit
        }),
      });

      if (response.ok) {
        alert('MCQ updated successfully!');
        setShowEditModal(false);
        setEditingMCQ(null);
        fetchGeneratedMCQs(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`Error updating MCQ: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating MCQ:', error);
      alert('Error updating MCQ');
    }
  };

  const handleDeleteMCQ = async (mcqId) => {
    if (!window.confirm('Are you sure you want to delete this MCQ?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/generated-mcqs/${mcqId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('MCQ deleted successfully!');
        fetchGeneratedMCQs(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`Error deleting MCQ: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting MCQ:', error);
      alert('Error deleting MCQ');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading session management..." />;
  }

  if (!session) {
    return <div>Session not found</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Session Header */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
            <p className="text-gray-600 mt-1">{session.course_name}</p>
            <p className="text-sm text-gray-500 mt-2">{session.description}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{session.session_id}</div>
                <div className="text-sm text-gray-500">Session ID</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{participants.length}</div>
                <div className="text-sm text-gray-500">Participants</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{polls.length}</div>
                <div className="text-sm text-gray-500">Polls</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-medium ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
                  WebSocket: {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Poll Alert */}
      {activePoll && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-green-800 font-medium">Active Poll: {activePoll.question}</span>
            </div>
            <button
              onClick={() => handleDeactivatePoll(activePoll.id)}
              className="text-green-600 hover:text-green-800 font-medium"
            >
              End Poll
            </button>
          </div>
        </div>
      )}

      {/* WebSocket Status Alert */}
      {!wsConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-yellow-800 font-medium">WebSocket Disconnected - Real-time features may not work. Attempting to reconnect...</span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'polls', name: 'Polls', icon: '📝' },
              { id: 'generated-mcqs', name: 'Generated MCQs', icon: '🤖' },
              { id: 'participants', name: 'Participants', icon: '👥' },
              { id: 'analytics', name: 'Analytics', icon: '📈' }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Session Status</h3>
                  <p className="text-blue-700">
                    {session.is_active ? '🟢 Active' : '🔴 Inactive'}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Participants</h3>
                  <p className="text-green-700">{participants.length} students joined</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-2">Generated MCQs</h3>
                  <p className="text-purple-700">{generatedMCQs.length} available</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Quick Actions</h3>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setActiveTab('polls')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                  >
                    Create Poll
                  </button>
                  <button
                    onClick={() => setActiveTab('generated-mcqs')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                  >
                    Send MCQs
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">WebSocket Status</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className={`text-sm font-medium ${wsConnected ? 'text-green-700' : 'text-red-700'}`}>
                    {wsConnected ? 'Connected - Real-time features active' : 'Disconnected - Attempting to reconnect...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Polls Tab */}
          {activeTab === 'polls' && (
            <div className="space-y-6">
              {/* Create New Poll Form */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Create New Poll</h3>
                <form onSubmit={handleCreatePoll} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Question *
                    </label>
                    <textarea
                      value={newPoll.question}
                      onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows="3"
                      placeholder="Enter your poll question..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Options *
                    </label>
                    {newPoll.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2 mb-2">
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={newPoll.correctAnswer === index}
                          onChange={() => setNewPoll({ ...newPoll, correctAnswer: index })}
                          className="text-blue-600"
                        />
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Option ${index + 1}`}
                          required={index < 2}
                        />
                      </div>
                    ))}
                    <p className="text-sm text-gray-500 mt-1">
                      Select the correct answer by clicking the radio button
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Justification
                      </label>
                      <textarea
                        value={newPoll.justification}
                        onChange={(e) => setNewPoll({ ...newPoll, justification: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows="2"
                        placeholder="Explain why this is the correct answer..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Time Limit (seconds)
                      </label>
                      <input
                        type="number"
                        value={newPoll.timeLimit}
                        onChange={(e) => setNewPoll({ ...newPoll, timeLimit: parseInt(e.target.value) })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="10"
                        max="300"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
                  >
                    Create Poll
                  </button>
                </form>
              </div>

              {/* Existing Polls */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Existing Polls</h3>
                {polls.length === 0 ? (
                  <p className="text-gray-500">No polls created yet.</p>
                ) : (
                  <div className="space-y-4">
                    {polls.map((poll) => (
                      <div key={poll.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-2">{poll.question}</h4>
                            <div className="space-y-1">
                              {poll.options.map((option, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                                    index === poll.correctAnswer ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {String.fromCharCode(65 + index)}
                                  </span>
                                  <span className={index === poll.correctAnswer ? 'font-medium text-green-800' : 'text-gray-700'}>
                                    {option}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Responses: {poll.responses} • Created: {formatTimeAgo(poll.createdAt)}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {poll.isActive ? (
                              <button
                                onClick={() => handleDeactivatePoll(poll.id)}
                                className="bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                              >
                                End Poll
                              </button>
                            ) : (
                              <button
                                onClick={() => activatePoll(poll)}
                                className="bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                disabled={!wsConnected}
                                title={!wsConnected ? 'WebSocket disconnected - polls may not reach students in real-time' : ''}
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other tabs remain the same... */}
          {/* Generated MCQs Tab */}
          {activeTab === 'generated-mcqs' && (
            <GeneratedMCQs 
              sessionId={sessionId}
              generatedMCQs={generatedMCQs}
              onMCQsSent={fetchGeneratedMCQs}
            />
          )}



          {/* Participants Tab */}
          {activeTab === 'participants' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Session Participants</h3>
                <div className="text-sm text-gray-500">
                  {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </div>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No participants yet.</p>
                  <p className="text-sm text-gray-400">
                    Share session ID <strong>{session.session_id}</strong> with students to join.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Student
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Joined At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {participants.map((participant) => (
                        <tr key={participant.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {participant.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {participant.email}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {formatTimeAgo(participant.joined_at)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              participant.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {participant.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Session Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Total Participants</h4>
                  <p className="text-2xl font-bold text-blue-700">{participants.length}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2">Active Polls</h4>
                  <p className="text-2xl font-bold text-green-700">{polls.filter(p => p.isActive).length}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 mb-2">Total Polls</h4>
                  <p className="text-2xl font-bold text-purple-700">{polls.length}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <h4 className="font-semibold text-orange-900 mb-2">Generated MCQs</h4>
                  <p className="text-2xl font-bold text-orange-700">{generatedMCQs.length}</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-600">
                  Detailed analytics and reporting features would be implemented here in a full application.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit MCQ Modal */}
      {showEditModal && editingMCQ && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit MCQ</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question *
                </label>
                <textarea
                  value={editingMCQ.question}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, question: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows="3"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Options *
                </label>
                {editingMCQ.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="radio"
                      name="editCorrectAnswer"
                      checked={editingMCQ.correctAnswer === index}
                      onChange={() => setEditingMCQ({ ...editingMCQ, correctAnswer: index })}
                      className="text-blue-600"
                    />
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const updatedOptions = [...editingMCQ.options];
                        updatedOptions[index] = e.target.value;
                        setEditingMCQ({ ...editingMCQ, options: updatedOptions });
                      }}
                      className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Justification
                </label>
                <textarea
                  value={editingMCQ.justification}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, justification: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows="2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Limit (seconds)
                </label>
                <input
                  type="number"
                  value={editingMCQ.timeLimit}
                  onChange={(e) => setEditingMCQ({ ...editingMCQ, timeLimit: parseInt(e.target.value) })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="10"
                  max="300"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingMCQ(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMCQ}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Update MCQ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSessionManagement;