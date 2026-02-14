import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function toTitle(value) {
  return String(value || '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSkillGuidance(skillName) {
  const key = String(skillName || '').toLowerCase();

  if (key.includes('tax')) {
    return [
      'Use this during tax-prep to classify expenses and review deduction readiness.',
      'Follow with manual review for low-confidence or uncategorized transactions.'
    ];
  }

  if (key.includes('recon') || key.includes('match')) {
    return [
      'Use this during month-end close to reconcile bank and ledger data.',
      'Focus review on unmatched transactions and posting adjustments.'
    ];
  }

  if (key.includes('anomaly') || key.includes('fraud')) {
    return [
      'Use this to detect unusual activity before filing or audit sign-off.',
      'Escalate high-severity alerts and capture investigation notes.'
    ];
  }

  if (key.includes('audit') || key.includes('compliance')) {
    return [
      'Use this when preparing audit support and compliance evidence.',
      'Keep generated outputs in the client workpaper package.'
    ];
  }

  if (key.includes('extract') || key.includes('parse')) {
    return [
      'Use this first after document upload to create structured financial data.',
      'Then run categorization, reconciliation, or anomaly checks on extracted rows.'
    ];
  }

  if (key.includes('export')) {
    return [
      'Use this to produce client-ready deliverables and workpaper exports.',
      'Share generated files for downstream review and approvals.'
    ];
  }

  return [
    'Use this skill to automate a specific finance workflow in the CPA process.',
    'Review outputs and exceptions before final sign-off.'
  ];
}

function normalizeSkill(raw) {
  return {
    name: raw.name,
    description: raw.description || 'No description available.',
    vertical: raw.vertical || 'finance',
    tier: raw.tier || 1,
    requiredInputs: raw.requiredInputs || [],
    inputFields: raw.inputFields || [],
    outputFields: raw.outputFields || []
  };
}

export default function FinanceSkills() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedSkillName, setSelectedSkillName] = useState('');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/api/v1/skills');
      const fetchedSkills = Array.isArray(response.skills) ? response.skills.map(normalizeSkill) : [];

      setSkills(fetchedSkills.sort((a, b) => a.name.localeCompare(b.name)));
      if (fetchedSkills.length > 0) {
        setSelectedSkillName(fetchedSkills[0].name);
      }
    } catch (skillsError) {
      try {
        // Fallback endpoint with basic metadata
        const fallbackResponse = await api.get('/api/v1/chat/tools');
        const fallbackSkills = Array.isArray(fallbackResponse.tools)
          ? fallbackResponse.tools.map((tool) => normalizeSkill(tool))
          : [];

        setSkills(fallbackSkills.sort((a, b) => a.name.localeCompare(b.name)));
        if (fallbackSkills.length > 0) {
          setSelectedSkillName(fallbackSkills[0].name);
        }
      } catch (fallbackError) {
        setError(skillsError.message || 'Failed to load skills.');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      const searchTerm = search.trim().toLowerCase();
      const matchesSearch = !searchTerm
        || skill.name.toLowerCase().includes(searchTerm)
        || skill.description.toLowerCase().includes(searchTerm);

      const matchesTier = tierFilter === 'all' || String(skill.tier) === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [skills, search, tierFilter]);

  const selectedSkill = useMemo(() => {
    const match = filteredSkills.find((skill) => skill.name === selectedSkillName);
    return match || filteredSkills[0] || null;
  }, [filteredSkills, selectedSkillName]);

  const availableTiers = useMemo(() => {
    return [...new Set(skills.map((skill) => String(skill.tier)))].sort((a, b) => Number(a) - Number(b));
  }, [skills]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Skills Catalog</h1>
          <p className="text-gray-600 mt-1">
            All available finance skills and what each one does.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by skill name or description..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />

            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Tiers</option>
              {availableTiers.map((tier) => (
                <option key={tier} value={tier}>{`Tier ${tier}`}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadSkills}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
            >
              Refresh Skills
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
            Loading skills...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Showing {filteredSkills.length} of {skills.length} skills
                </p>
              </div>

              <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
                {filteredSkills.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">No skills match your filters.</div>
                ) : (
                  filteredSkills.map((skill) => (
                    <button
                      type="button"
                      key={skill.name}
                      onClick={() => setSelectedSkillName(skill.name)}
                      className={`w-full text-left p-4 transition ${selectedSkill?.name === skill.name ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="font-semibold text-gray-900">{toTitle(skill.name)}</p>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          Tier {skill.tier}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{skill.description}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-5">
              {!selectedSkill ? (
                <p className="text-gray-500">Select a skill to see details.</p>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{toTitle(selectedSkill.name)}</h2>
                      <p className="text-gray-600 mt-1">{selectedSkill.description}</p>
                    </div>
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full whitespace-nowrap">
                      {selectedSkill.vertical} · Tier {selectedSkill.tier}
                    </span>
                  </div>

                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">What CPAs typically do with this</h3>
                    <ul className="space-y-1">
                      {getSkillGuidance(selectedSkill.name).map((line) => (
                        <li key={line} className="text-sm text-gray-700">
                          • {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Required Inputs</h3>
                    {selectedSkill.requiredInputs.length === 0 ? (
                      <p className="text-sm text-gray-500">No required inputs listed.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedSkill.requiredInputs.map((field) => (
                          <span
                            key={field}
                            className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-full"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Input Fields</h3>
                    {selectedSkill.inputFields.length === 0 ? (
                      <p className="text-sm text-gray-500">No input schema details available.</p>
                    ) : (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Field</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedSkill.inputFields.map((field) => (
                              <tr key={field.name}>
                                <td className="px-3 py-2 text-gray-800">{field.name}</td>
                                <td className="px-3 py-2 text-gray-600">{field.type}</td>
                                <td className="px-3 py-2 text-gray-600">{field.description || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Output Fields</h3>
                    {selectedSkill.outputFields.length === 0 ? (
                      <p className="text-sm text-gray-500">No output schema details available.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedSkill.outputFields.map((field) => (
                          <span
                            key={field}
                            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded-full"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
