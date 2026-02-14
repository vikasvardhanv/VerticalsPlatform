import { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ToolResult from '../components/ToolResult';

function buildHealthcareSuggestions(profileName, toolResults = []) {
  const suggestions = [
    `Process intake forms for ${profileName || 'new patients'}`,
    'Redact PHI from clinical notes for research export',
    'Schedule follow-up appointments and check conflicts',
    'Analyze medications for potential drug interactions',
    'Generate ICD-10 medical codes from clinical documentation',
    'Verify insurance eligibility for upcoming procedures'
  ];

  toolResults.forEach((result) => {
    const output = result.output || {};

    if (result.tool === 'phi-redact' || result.tool === 'phi-validate') {
      suggestions.push('Run healthcare risk stratification on redacted data');
    }

    if (result.tool === 'clinical-notes-summarize') {
      suggestions.push('Generate medical codes from this clinical summary');
    }

    if (result.tool === 'prescription-generate' || result.tool === 'drug-interaction-check') {
      suggestions.push('Update patient medication profile with these checks');
    }

    if (output?.interactions?.length > 0) {
      suggestions.push(`Review ${output.interactions.length} critical drug interactions`);
    }

    if (output?.is_eligible === false) {
      suggestions.push('Update insurance details or contact provider for clearance');
    }
  });

  return [...new Set(suggestions)].slice(0, 6);
}

function buildCpaSuggestions(profileName, toolResults = []) {
  const suggestions = [
    `Extract transactions from all ${profileName || 'selected'} documents`,
    'Categorize expenses for tax filing and identify deductible items',
    'Reconcile bank transactions against ledger entries',
    'Run anomaly detection for fraud and compliance risks',
    'Generate an audit-ready package for this reporting period',
    'Export the latest results to Excel for workpapers'
  ];

  toolResults.forEach((result) => {
    const output = result.output || {};

    if (result.tool === 'tax-prep-automate' || result.tool === 'tax-categorize') {
      suggestions.push('Review low-confidence transactions before filing the return');
    }

    if (result.tool === 'doc-extract') {
      suggestions.push('Run tax categorization on extracted transactions');
    }

    if (result.tool === 'bank-recon-sync' || result.tool === 'transaction-match') {
      suggestions.push('Investigate unmatched transactions and post adjustments');
    }

    if (result.tool === 'anomaly-detect') {
      suggestions.push('Investigate critical anomalies and document remediation');
    }

    if (output?.needs_review?.length > 0) {
      suggestions.push(`Resolve ${output.needs_review.length} transactions flagged for manual review`);
    }

    if (output?.unmatched_bank?.length > 0 || output?.unmatched_ledger?.length > 0) {
      suggestions.push('Close open recon items to finalize month-end books');
    }

    if (typeof output?.risk_score === 'number' && output.risk_score >= 50) {
      suggestions.push('Prioritize high-risk alerts and create an investigation memo');
    }
  });

  return [...new Set(suggestions)].slice(0, 6);
}


export default function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat state from localStorage on mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('selectedProfile');
    const savedMessages = localStorage.getItem('chatMessages');
    const savedConvId = localStorage.getItem('conversationId');
    const savedUser = localStorage.getItem('user');

    if (savedUser) {
      // Synchronize internal state with localStorage for initial mount
      setCurrentUser(JSON.parse(savedUser));
    }

    if (savedProfile) {
      setSelectedProfile(savedProfile);
    }
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Failed to parse saved messages:', e);
      }
    }
    if (savedConvId) {
      setConversationId(savedConvId);
    }

    loadProfiles();
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
    }
  }, [messages]);

  // Save conversationId to localStorage when it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('conversationId', conversationId);
    }
  }, [conversationId]);

  // Save selected profile to localStorage and fetch documents when it changes
  useEffect(() => {
    if (selectedProfile) {
      localStorage.setItem('selectedProfile', selectedProfile);
      fetchDocuments();
    }
  }, [selectedProfile]);

  const loadProfiles = async () => {
    try {
      const data = await api.get('/api/v1/profiles');
      if (data.success) {
        setProfiles(data.profiles);
        // Auto-select first profile
        if (data.profiles.length > 0) {
          setSelectedProfile(data.profiles[0].profileName);
        }
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const fetchDocuments = async () => {
    if (!selectedProfile) return;

    setLoadingDocs(true);
    try {
      const response = await api.get(`/api/v1/documents?profile_name=${selectedProfile}&limit=50`);
      setDocuments(response.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await api.post('/api/v1/chat', {
        message: userMessage,
        conversation_id: conversationId,
        profile_name: selectedProfile
      });

      if (response.success) {
        setConversationId(response.conversation_id);

        // Add assistant response with tool results
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.response,
          toolResults: response.tool_results,
          provider: response.provider,
          model: response.model
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'error',
          content: response.error || 'Something went wrong'
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: error.message || 'Failed to send message'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem('chatMessages');
    localStorage.removeItem('conversationId');
  };

  const isHealthcare = (user || currentUser)?.vertical === 'healthcare';

  const examplePrompts = isHealthcare ? [
    "Redact PHI from the patient intake form",
    "Check for interactions between Warfarin and Aspirin",
    "Summarize the clinical notes from today's visit",
    "Verify insurance for patient Jane Doe",
    "Generate ICD-10 codes for hypertension"
  ] : [
    "Categorize my January business expenses",
    "Check for any unusual transactions this month",
    "Reconcile the checking account with QuickBooks",
    "Prepare audit documentation for Q4",
    "Extract data from uploaded tax documents"
  ];
  const latestToolResults = [...messages].reverse().find((msg) => msg.toolResults && msg.toolResults.length > 0)?.toolResults || [];
  const suggestions = isHealthcare
    ? buildHealthcareSuggestions(selectedProfile, latestToolResults)
    : buildCpaSuggestions(selectedProfile, latestToolResults);

  const brandName = isHealthcare ? 'MediGuard AI' : 'FinSecure AI';
  const inputPlaceholder = isHealthcare
    ? "Ask about PHI, clinical notes, prescriptions, or referrals..."
    : "Ask about tax categories, reconciliation, or audits...";

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Profile Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📁 Active Profile {loadingDocs && <span className="text-xs text-gray-500">(Loading {documents.length} documents...)</span>}
            </label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Select a profile...</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.profileName}>
                  {profile.displayName || profile.profileName} ({documents.length} docs)
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedProfile && documents.length === 0 && !loadingDocs && (
          <p className="mt-2 text-sm text-amber-600">
            ⚠️ No documents found for this profile. Upload documents first.
          </p>
        )}
      </div>

      {/* Chat Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Chat with {brandName}</h1>
          <p className="text-sm text-gray-500">
            {selectedProfile
              ? `Chatting as ${profiles.find(p => p.profileName === selectedProfile)?.displayName || selectedProfile}`
              : 'Select a profile to start chatting'
            }
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear Chat
          </button>
        )}
      </div>

      {/* Messages Container */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <span className="text-6xl mb-4">🤖</span>
              <h2 className="text-lg font-medium text-gray-900 mb-2">How can I help you today?</h2>
              <p className="text-gray-500 mb-6 max-w-md">
                I can help with {isHealthcare ? 'HIPAA compliance, clinical note summarization, prescription checks, and diagnostics' : 'tax categorization, bank reconciliation, anomaly detection, and audit preparation'}.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestions.length > 0 ? suggestions.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition"
                  >
                    {prompt}
                  </button>
                )) : examplePrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i}>
                <ChatMessage message={msg} />
                {msg.toolResults && msg.toolResults.length > 0 && (
                  <div className="ml-12 mt-2 space-y-2">
                    {msg.toolResults.map((result, j) => (
                      <ToolResult key={j} result={result} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-pulse flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animation-delay-200"></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animation-delay-400"></span>
              </div>
              <span className="text-sm">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={sendMessage} className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !selectedProfile}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Send
            </button>
          </div>
          {selectedProfile && suggestions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Suggested actions for {isHealthcare ? 'clinical' : 'CPA'} workflows
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={`suggestion-${i}`}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="px-2.5 py-1 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-200 hover:bg-primary-100 transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}


