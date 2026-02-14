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

    if (key.includes('phi')) {
        return [
            'Use this to ensure HIPAA compliance by redacting or validating Protected Health Information.',
            'Always run this before sharing medical records with external parties or unauthorized staff.'
        ];
    }

    if (key.includes('appointment')) {
        return [
            'Use this to optimize provider schedules and reduce appointment conflicts.',
            'Check nearby slots if a patient preferred time is unavailable.'
        ];
    }

    if (key.includes('prescription')) {
        return [
            'Use this to generate compliant prescriptions with automated drug-interaction checks.',
            'Review any major or critical warnings before final authorization.'
        ];
    }

    if (key.includes('lab-results')) {
        return [
            'Use this to convert unstructured lab reports into structured data for the patient record.',
            'Verify the interpretation flags (high/low/critical) against clinical standards.'
        ];
    }

    if (key.includes('insurance')) {
        return [
            'Use this at patient check-in to verify eligibility and coverage details.',
            'Inform patients of their copay and remaining deductible based on real-time verification.'
        ];
    }

    if (key.includes('billing') || key.includes('code')) {
        return [
            'Use this to assist with medical coding (ICD-10/CPT) based on clinical notes.',
            'Ensure the highest confidence codes are reviewed for medical necessity.'
        ];
    }

    if (key.includes('referral')) {
        return [
            'Use this to manage specialist referrals and track authorization status.',
            'Check expiration dates to ensure patients have active referrals for treatment.'
        ];
    }

    if (key.includes('interaction')) {
        return [
            'Use this for comprehensive medication reconciliation and risk assessment.',
            'Note any severe interactions that require immediate provider intervention.'
        ];
    }

    if (key.includes('diagnosis')) {
        return [
            'Use this as a clinical decision support tool to explore differential diagnoses.',
            'Correlate suggestions with clinical history and active symptoms.'
        ];
    }

    if (key.includes('risk')) {
        return [
            'Use this to stratify patients into risk categories (e.g., CV risk, Readmission).',
            'Follow suggested clinical pathways based on the patient risk category.'
        ];
    }

    return [
        'Use this skill to automate a specific healthcare workflow in the clinical process.',
        'Review outputs and exceptions before final clinical sign-off.'
    ];
}

function normalizeSkill(raw) {
    return {
        name: raw.name,
        description: raw.description || 'No description available.',
        vertical: raw.vertical || 'healthcare',
        tier: raw.tier || 1,
        requiredInputs: raw.requiredInputs || [],
        inputFields: raw.inputFields || [],
        outputFields: raw.outputFields || []
    };
}

export default function HealthcareSkills() {
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
                    <h1 className="text-3xl font-bold text-blue-900">MediGuard AI Skills</h1>
                    <p className="text-gray-600 mt-1">
                        Clinical workflows and intelligence tools for HIPAA-compliant healthcare.
                    </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search medical skills..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />

                        <select
                            value={tierFilter}
                            onChange={(event) => setTierFilter(event.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Tiers</option>
                            {availableTiers.map((tier) => (
                                <option key={tier} value={tier}>{`Tier ${tier}`}</option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={loadSkills}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                        >
                            Refresh Library
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
                        Loading clinical tools...
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                        {error}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                                <p className="text-sm text-gray-600">
                                    {filteredSkills.length} clinical skills available
                                </p>
                            </div>

                            <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
                                {filteredSkills.length === 0 ? (
                                    <div className="p-6 text-sm text-gray-500">No tools found.</div>
                                ) : (
                                    filteredSkills.map((skill) => (
                                        <button
                                            type="button"
                                            key={skill.name}
                                            onClick={() => setSelectedSkillName(skill.name)}
                                            className={`w-full text-left p-4 transition ${selectedSkill?.name === skill.name ? 'bg-blue-50 border-r-4 border-blue-600' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <p className="font-semibold text-gray-900">{toTitle(skill.name)}</p>
                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase font-bold">
                                                    T{skill.tier}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 line-clamp-2">{skill.description}</p>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl p-6">
                            {!selectedSkill ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <span className="text-5xl mb-4">🏥</span>
                                    <p className="text-gray-500">Select a clinical tool from the list to view specifications and guidance.</p>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-start justify-between gap-3 mb-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-2xl">⚡</span>
                                                <h2 className="text-2xl font-bold text-gray-900">{toTitle(selectedSkill.name)}</h2>
                                            </div>
                                            <p className="text-gray-600">{selectedSkill.description}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Vertical</span>
                                            <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full font-medium">
                                                Healthcare
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <section className="mb-6">
                                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-3">Clinical Guidance</h3>
                                                <ul className="space-y-3">
                                                    {getSkillGuidance(selectedSkill.name).map((line) => (
                                                        <li key={line} className="flex gap-2 text-sm text-gray-700">
                                                            <span className="text-blue-500 mt-0.5">✓</span>
                                                            <span>{line}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </section>

                                            <section>
                                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-3">Output Parameters</h3>
                                                {selectedSkill.outputFields.length === 0 ? (
                                                    <p className="text-sm text-gray-500 italic">No output metadata defined.</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedSkill.outputFields.map((field) => (
                                                            <span
                                                                key={field}
                                                                className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded border border-gray-200 font-mono"
                                                            >
                                                                {field}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </section>
                                        </div>

                                        <div>
                                            <section className="mb-6">
                                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-3">Required Payload Fields</h3>
                                                {selectedSkill.requiredInputs.length === 0 ? (
                                                    <p className="text-sm text-gray-500 italic">No required fields.</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedSkill.requiredInputs.map((field) => (
                                                            <span
                                                                key={field}
                                                                className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded border border-amber-200 font-bold"
                                                            >
                                                                {field}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </section>

                                            <section>
                                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-3">Data Schema</h3>
                                                {selectedSkill.inputFields.length === 0 ? (
                                                    <p className="text-sm text-gray-500 italic">No schema details available.</p>
                                                ) : (
                                                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                                                        <table className="min-w-full text-xs">
                                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left font-bold text-gray-700">Field</th>
                                                                    <th className="px-3 py-2 text-left font-bold text-gray-700">Type</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {selectedSkill.inputFields.map((field) => (
                                                                    <tr key={field.name}>
                                                                        <td className="px-3 py-2 font-mono text-blue-700">{field.name}</td>
                                                                        <td className="px-3 py-2 text-gray-500 capitalize">{field.type}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </section>
                                        </div>
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
