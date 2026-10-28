'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/layout';
import {
  Shield,
  Plus,
  CheckCircle,
  AlertTriangle,
  FileText,
  Sliders,
  Clock,
  Laptop,
  Check,
} from 'lucide-react';
import api from '@/lib/api';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    description: '',
    policyType: 'DEVICE',
    severity: 'MEDIUM',
    maxIdleMinutes: 15,
    enforceAntivirus: true,
    requirePasscode: true,
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/policies');
      setPolicies(res.data || []);
    } catch (err) {
      console.error('Failed to load policies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/policies', {
        name: newPolicy.name,
        description: newPolicy.description,
        policyType: newPolicy.policyType,
        severity: newPolicy.severity,
        rules: {
          maxIdleMinutes: newPolicy.maxIdleMinutes,
          enforceAntivirus: newPolicy.enforceAntivirus,
          requirePasscode: newPolicy.requirePasscode,
        },
      });

      setShowCreateModal(false);
      setNewPolicy({
        name: '',
        description: '',
        policyType: 'DEVICE',
        severity: 'MEDIUM',
        maxIdleMinutes: 15,
        enforceAntivirus: true,
        requirePasscode: true,
      });
      fetchPolicies();
    } catch (err: any) {
      alert(`Failed to create policy: ${err.message || 'Error'}`);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Compliance & Device Policies</h1>
            <p className="text-gray-500 text-sm mt-1">
              Define operational compliance rules, idle thresholds, and security baselines across endpoints.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Policy Rule
          </button>
        </div>

        {/* Policies Grid */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-3 text-sm text-gray-500 font-medium">Loading policies...</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <Shield className="w-12 h-12 text-indigo-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-800">No device policies defined yet</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Create your organization&apos;s baseline policies (e.g., maximum inactivity limit, mandatory antivirus, or passcode complexity).
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create First Policy
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {policies.map((pol) => (
              <div
                key={pol.id}
                className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-300 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                      {pol.policyType}
                    </span>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                        pol.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {pol.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mt-3">{pol.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {pol.description || 'Global organizational device baseline policy.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600 font-mono">
                  {pol.rules?.maxIdleMinutes && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Idle Alert:</span>
                      <span className="font-semibold text-gray-800">{pol.rules.maxIdleMinutes} mins</span>
                    </div>
                  )}
                  {pol.rules?.enforceAntivirus !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Mandatory Antivirus:</span>
                      <span className="font-semibold text-emerald-600">Enabled</span>
                    </div>
                  )}
                  {pol.rules?.requirePasscode !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Device Lock Required:</span>
                      <span className="font-semibold text-emerald-600">Enforced</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Policy Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
              <h3 className="text-lg font-bold text-gray-900">Create Device Management Policy</h3>

              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Policy Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard Workstation Inactivity Policy"
                    value={newPolicy.name}
                    onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="State the purpose and scope of this compliance rule..."
                    value={newPolicy.description}
                    onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Type</label>
                    <select
                      value={newPolicy.policyType}
                      onChange={(e) => setNewPolicy({ ...newPolicy, policyType: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="DEVICE">DEVICE</option>
                      <option value="SECURITY">SECURITY</option>
                      <option value="COMPLIANCE">COMPLIANCE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Severity</label>
                    <select
                      value={newPolicy.severity}
                      onChange={(e) => setNewPolicy({ ...newPolicy, severity: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Max Inactivity Idle Threshold (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={newPolicy.maxIdleMinutes}
                    onChange={(e) => setNewPolicy({ ...newPolicy, maxIdleMinutes: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                  >
                    Save & Deploy Policy
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
