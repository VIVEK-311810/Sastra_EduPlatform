import React, { useState, useEffect, useRef } from 'react';

const GeneratedMCQs = ({ sessionId, generatedMCQs, onMCQsSent }) => {
  const [mcqs, setMcqs] = useState([]);
  const [selectedMCQs, setSelectedMCQs] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [editingMCQ, setEditingMCQ] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  
  // WebSocket reference - get from global window.socket or create new
  const wsRef = useRef(null);

  useEffect(() => {
    // Use existing WebSocket connection from parent component
    if (window.socket) {
      wsRef.current = window.socket;
      setWsConnected(window.socket.readyState === WebSocket.OPEN);
    }
    
    if (generatedMCQs && Array.isArray(generatedMCQs)) {
      // Add unique IDs to MCQs for tracking
      const mcqsWithIds = generatedMCQs.map((mcq, index) => ({
        ...mcq,
        tempId: mcq.id || `temp_${index}`,
        isEdited: false
      }));
      setMcqs(mcqsWithIds);
      // Select all MCQs by default
      setSelectedMCQs(new Set(mcqsWithIds.map(mcq => mcq.tempId)));
    }
  }, [generatedMCQs]);

  const handleMCQSelection = (tempId) => {
    const newSelected = new Set(selectedMCQs);
    if (newSelected.has(tempId)) {
      newSelected.delete(tempId);
    } else {
      newSelected.add(tempId);
    }
    setSelectedMCQs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedMCQs.size === mcqs.length) {
      setSelectedMCQs(new Set());
    } else {
      setSelectedMCQs(new Set(mcqs.map(mcq => mcq.tempId)));
    }
  };

  const handleEditMCQ = (tempId) => {
    const mcq = mcqs.find(m => m.tempId === tempId);
    setEditingMCQ({ ...mcq });
  };

  const handleSaveEdit = () => {
    setMcqs(mcqs.map(mcq => 
      mcq.tempId === editingMCQ.tempId 
        ? { ...editingMCQ, isEdited: true }
        : mcq
    ));
    setEditingMCQ(null);
  };

  const handleCancelEdit = () => {
    setEditingMCQ(null);
  };

  const handleDeleteMCQ = (tempId) => {
    if (window.confirm('Are you sure you want to delete this MCQ?')) {
      setMcqs(mcqs.filter(mcq => mcq.tempId !== tempId));
      // Remove from selected if it was selected
      const newSelected = new Set(selectedMCQs);
      newSelected.delete(tempId);
      setSelectedMCQs(newSelected);
    }
  };

  // NEW: Send MCQs function that works exactly like polls tab activate
  const handleSendMCQs = async () => {
    const selectedMCQData = mcqs.filter(mcq => selectedMCQs.has(mcq.tempId));
    
    if (selectedMCQData.length === 0) {
      alert('Please select at least one MCQ to send.');
      return;
    }

    if (selectedMCQData.length > 1) {
      alert('Please select only one MCQ to send at a time.');
      return;
    }

    setLoading(true);
    try {
      const mcq = selectedMCQData[0];
      console.log('Sending MCQ:', mcq);
      
      // Step 1: Create the poll from MCQ data
      const pollData = {
        session_id: sessionId,
        question: mcq.question,
        options: Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options),
        correct_answer: mcq.correct_answer,
        justification: mcq.justification || '',
        time_limit: mcq.time_limit || 60
      };

      const createResponse = await fetch('http://localhost:3001/api/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pollData),
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create poll: ${createResponse.statusText}`);
      }

      const createdPoll = await createResponse.json();
      console.log('Poll created successfully:', createdPoll);

      // Step 2: Immediately activate the poll (EXACT SAME LOGIC AS POLLS TAB)
      const activateResponse = await fetch(`http://localhost:3001/api/polls/${createdPoll.id}/activate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!activateResponse.ok) {
        throw new Error(`Failed to activate poll: ${activateResponse.statusText}`);
      }

      const activatedPoll = await activateResponse.json();
      console.log('Poll activated successfully:', activatedPoll);

      // Step 3: WebSocket broadcast (EXACT SAME AS POLLS TAB)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: 'activate-poll',
          sessionId: sessionId,
          poll: activatedPoll
        };
        
        console.log('Sending WebSocket message:', message);
        wsRef.current.send(JSON.stringify(message));
        console.log('Poll broadcast via WebSocket successfully');
        
        alert('MCQ sent to students successfully!');
      } else {
        console.warn('WebSocket not connected. Connection status:', wsConnected);
        console.warn('WebSocket state:', wsRef.current?.readyState);
        
        // Still show success for API call, but warn about WebSocket
        alert('MCQ activated in database, but WebSocket connection issue detected. Students may not receive real-time notification.');
      }

      // Step 4: Remove the sent MCQ from the list
      setMcqs(mcqs.filter(m => m.tempId !== mcq.tempId));
      setSelectedMCQs(new Set());
      
      // Step 5: Notify parent component
      if (onMCQsSent) {
        onMCQsSent();
      }

    } catch (error) {
      console.error('Error sending MCQ:', error);
      alert('Error sending MCQ: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mcqs || mcqs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Generated MCQs</h3>
        <p className="text-gray-500">No generated MCQs available. MCQs will appear here when generated from class transcripts.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Generated MCQs ({mcqs.length})</h3>
        <div className="flex space-x-2">
          <button
            onClick={handleSelectAll}
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
          >
            {selectedMCQs.size === mcqs.length ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={handleSendMCQs}
            disabled={selectedMCQs.size === 0 || loading || !wsConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded font-medium"
            title={!wsConnected ? 'WebSocket disconnected - MCQs may not reach students in real-time' : ''}
          >
            {loading ? 'Sending...' : selectedMCQs.size === 1 ? 'Send MCQ' : `Select 1 MCQ to Send`}
          </button>
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      {!wsConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-yellow-800 text-sm">WebSocket disconnected - MCQs may not reach students in real-time</span>
          </div>
        </div>
      )}

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {mcqs.map((mcq, index) => (
          <div key={mcq.tempId} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedMCQs.has(mcq.tempId)}
                  onChange={() => handleMCQSelection(mcq.tempId)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-500">MCQ {index + 1}</span>
                {mcq.isEdited && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Edited</span>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditMCQ(mcq.tempId)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteMCQ(mcq.tempId)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="font-medium text-gray-800 mb-2">{mcq.question}</h4>
              <div className="space-y-1">
                {(Array.isArray(mcq.options) ? mcq.options : JSON.parse(mcq.options)).map((option, optionIndex) => (
                  <div key={optionIndex} className={`text-sm p-2 rounded ${
                    optionIndex === mcq.correct_answer 
                      ? 'bg-green-50 text-green-800 font-medium' 
                      : 'bg-gray-50 text-gray-700'
                  }`}>
                    {String.fromCharCode(65 + optionIndex)}. {option}
                    {optionIndex === mcq.correct_answer && ' ✓'}
                  </div>
                ))}
              </div>
            </div>

            {mcq.justification && (
              <div className="text-sm text-gray-600 bg-blue-50 p-2 rounded">
                <strong>Justification:</strong> {mcq.justification}
              </div>
            )}

            <div className="text-xs text-gray-500 mt-2">
              Time Limit: {mcq.time_limit || 60} seconds
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingMCQ && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit MCQ</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                <textarea
                  value={editingMCQ.question}
                  onChange={(e) => setEditingMCQ({...editingMCQ, question: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                {(Array.isArray(editingMCQ.options) ? editingMCQ.options : JSON.parse(editingMCQ.options)).map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="radio"
                      name="correct_answer"
                      checked={editingMCQ.correct_answer === index}
                      onChange={() => setEditingMCQ({...editingMCQ, correct_answer: index})}
                      className="w-4 h-4 text-blue-600"
                    />
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const currentOptions = Array.isArray(editingMCQ.options) ? editingMCQ.options : JSON.parse(editingMCQ.options);
                        const newOptions = [...currentOptions];
                        newOptions[index] = e.target.value;
                        setEditingMCQ({...editingMCQ, options: newOptions});
                      }}
                      className="flex-1 p-2 border border-gray-300 rounded-md"
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justification</label>
                <textarea
                  value={editingMCQ.justification || ''}
                  onChange={(e) => setEditingMCQ({...editingMCQ, justification: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  rows="2"
                  placeholder="Explain why this question is important..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (seconds)</label>
                <input
                  type="number"
                  value={editingMCQ.time_limit || 60}
                  onChange={(e) => setEditingMCQ({...editingMCQ, time_limit: parseInt(e.target.value)})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  min="10"
                  max="300"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={handleCancelEdit}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedMCQs;