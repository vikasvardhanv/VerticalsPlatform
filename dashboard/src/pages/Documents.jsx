import { useState, useEffect } from 'react';
import api from '../services/api';

function Documents({ user }) {
  const isHealthcare = user?.vertical === 'healthcare';
  const [documents, setDocuments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // Load selected profile from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('selectedProfile');
    if (saved) {
      setSelectedProfile(saved);
    }
    loadProfiles();
    loadDocuments();
  }, []);

  // Save selected profile to localStorage when it changes
  useEffect(() => {
    if (selectedProfile) {
      localStorage.setItem('selectedProfile', selectedProfile);
      loadDocuments();
    }
  }, [selectedProfile]);

  const loadProfiles = async () => {
    try {
      const data = await api.get('/api/v1/profiles');
      if (data.success) {
        setProfiles(data.profiles);
        // Auto-select first profile if available
        if (data.profiles.length > 0 && !selectedProfile) {
          setSelectedProfile(data.profiles[0].profileName);
        }
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const url = selectedProfile
        ? `/api/v1/documents?profile_name=${selectedProfile}`
        : '/api/v1/documents';
      const data = await api.get(url);
      if (data.success) {
        setDocuments(data.documents);
      }
    } catch (err) {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    try {
      const data = await api.post('/api/v1/profiles', {
        profile_name: newProfileName.toLowerCase().replace(/\s+/g, '_'),
        display_name: newProfileName
      });

      if (data.success) {
        setProfiles(prev => [data.profile, ...prev]);
        setSelectedProfile(data.profile.profileName);
        setNewProfileName('');
        setShowNewProfile(false);
      }
    } catch (err) {
      setError('Failed to create profile');
    }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    if (!selectedProfile) {
      setError('Please select a profile first');
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('profile_name', selectedProfile);

    try {
      const response = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setDocuments(prev => [...data.documents, ...prev]);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleProcess = async (docId) => {
    try {
      const data = await api.post(`/api/v1/documents/${docId}/process`);
      if (data.success) {
        setDocuments(prev => prev.map(doc =>
          doc.id === docId
            ? { ...doc, processed: true, status: 'processed', extractedData: data.extraction_result.extracted_data }
            : doc
        ));
      }
    } catch (err) {
      setError('Processing failed');
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document?')) return;

    try {
      await api.delete(`/api/v1/documents/${docId}`);
      setDocuments(prev => prev.filter(doc => doc.id !== docId));
    } catch (err) {
      setError('Delete failed');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      {/* Profile Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📁 Active Profile
            </label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Select a profile...</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.profileName}>
                  {profile.displayName || profile.profileName}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowNewProfile(!showNewProfile)}
            className="mt-6 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            + New Profile
          </button>
        </div>

        {showNewProfile && (
          <form onSubmit={handleCreateProfile} className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex gap-3">
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder={isHealthcare ? "Patient record profile (e.g., John Doe MRN-123)" : "Profile name (e.g., John Doe CPA)"}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowNewProfile(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">
            {selectedProfile
              ? `Showing documents for ${profiles.find(p => p.profileName === selectedProfile)?.displayName || selectedProfile}`
              : 'Select a profile to view documents'
            }
          </p>
        </div>
        <label className={`px-4 py-2 rounded-lg font-medium transition ${selectedProfile && !uploading
            ? 'bg-primary-600 text-white hover:bg-primary-700 cursor-pointer'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}>
          {uploading ? 'Uploading...' : 'Upload Documents'}
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading || !selectedProfile}
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-5xl mb-4 block">{isHealthcare ? '🏥' : '📄'}</span>
          <h2 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h2>
          <p className="text-gray-500 mb-4">
            {isHealthcare
              ? 'Upload medical records, lab results, clinical transcripts, or prescriptions'
              : 'Upload W-2s, 1099s, receipts, or invoices to get started'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{doc.originalName}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {doc.documentType || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatSize(doc.size)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${doc.status === 'processed' ? 'bg-green-100 text-green-800' :
                        doc.status === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                      }`}>
                      {doc.status || 'uploaded'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(doc.uploadedAt)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {!doc.processed && (
                      <button
                        onClick={() => handleProcess(doc.id)}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        Process
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Documents;
