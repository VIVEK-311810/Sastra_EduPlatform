import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { utils } from '../../utils/api';

const SessionResources = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const currentUser = utils.getCurrentUser();

  const handleBackToHistory = () => {
    navigate('/session-history');
  };

  const handleBackToDashboard = () => {
    navigate(currentUser?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={handleBackToHistory}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Session History
          </button>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Session Resources</h1>
        <p className="text-gray-600">Session ID: {sessionId}</p>
      </div>

      {/* Resources Placeholder */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
        <div className="text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          {/* Placeholder Content */}
          <h2 className="text-2xl font-semibold text-gray-800 mb-3">Resources Coming Soon</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            We can see Resources here. This section will contain session materials, documents, 
            presentations, and other learning resources shared by the instructor.
          </p>

          {/* Feature Preview */}
          <div className="grid md:grid-cols-3 gap-4 mt-8 text-left">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2">Documents</h3>
              <p className="text-sm text-gray-600">PDFs, presentations, and reading materials</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2">Links</h3>
              <p className="text-sm text-gray-600">External resources and reference materials</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2">Media</h3>
              <p className="text-sm text-gray-600">Videos, audio recordings, and multimedia content</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center mt-8">
            <button
              onClick={handleBackToHistory}
              className="btn-secondary"
            >
              Back to Sessions
            </button>
            <button
              onClick={handleBackToDashboard}
              className="btn-primary"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Resources will be available once the instructor uploads session materials.</p>
      </div>
    </div>
  );
};

export default SessionResources;

