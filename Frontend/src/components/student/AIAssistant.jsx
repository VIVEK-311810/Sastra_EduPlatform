import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { utils } from '../../utils/api';

const AIAssistant = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const currentUser = utils.getCurrentUser();

  const handleBackToDashboard = () => {
    navigate('/student/dashboard');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    console.log('Message to AI:', message);
    setMessage('');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="mb-10">
        
        {/* Title */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Assistant</h1>
            <p className="text-gray-600">Your personal learning companion</p>
          </div>
        </div>
      </div>

      {/* AI Assistant Interface */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col h-[600px]">
        
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673..." />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-lg">SASTRA AI Assistant</h3>
              <p className="text-sm text-blue-100">Ready to help with your studies</p>
            </div>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {/* Your content here */}
        </div>

        {/* Features */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-left">
            {[
              { color: 'blue', title: 'Study Help', desc: 'Get explanations and clarifications on course topics' },
              { color: 'green', title: 'Assignment Support', desc: 'Guidance on homework and project tasks' },
              { color: 'purple', title: 'Quick Answers', desc: 'Instant responses to academic questions' },
              { color: 'orange', title: 'Study Planning', desc: 'Help organize your learning schedule' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-lg p-5 border border-gray-200">
                <div className={`w-8 h-8 bg-${item.color}-100 rounded-lg flex items-center justify-center mb-3`}>
                  <div className={`w-4 h-4 text-${item.color}-600`}>
                    {/* Icon can be customized per feature */}
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth={2}></circle>
                    </svg>
                  </div>
                </div>
                <h3 className="font-medium text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Message Input Area */}
        <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your question here... (Coming soon)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled
            />
            <button
              type="submit"
              disabled
              className="px-6 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            AI Assistant functionality will be available in a future update
          </p>
        </div>

        {/* Bottom Back Button */}
        <div className="mt-8 text-center">
          <button
            onClick={handleBackToDashboard}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

    </div>
  );
};

export default AIAssistant;
