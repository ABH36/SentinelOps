'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/layout';
import {
  FileText,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  CheckCircle,
  Clock,
  User,
  Monitor,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Key,
  Download,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';

interface AuditItem {
  id: string;
  eventType: string;
  description?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  eventHash: string;
  previousHash?: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
  };
  device?: {
    id: string;
    deviceName: string;
    deviceId: string;
  };
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Chain verification status
  const [verifying, setVerifying] = useState(false);
  const [chainStatus, setChainStatus] = useState<{
    tested: boolean;
    isValid: boolean;
    brokenAt?: any;
  } | null>(null);

  // Comprehensive verification result
  const [verificationResult, setVerificationResult] = useState<{
    totalEvents: number;
    isIntact: boolean;
    violations: Array<{
      eventId: string;
      eventIndex: number;
      violationType: 'HASH_MISMATCH' | 'CHAIN_BREAK';
      expectedHash?: string;
      actualHash?: string;
      expectedPreviousHash?: string;
      actualPreviousHash?: string;
      timestamp: string;
      eventType: string;
    }>;
    verifiedAt: string;
    verificationDurationMs: number;
    firstEventAt?: string;
    lastEventAt?: string;
    certificate?: string;
  } | null>(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [eventTypeFilter]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (eventTypeFilter !== 'ALL') {
        params.eventType = eventTypeFilter;
      }
      const res = await api.get('/audit', { params });
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      // Call new comprehensive verification endpoint
      const res = await api.post('/audit/verify-chain');
      
      if (res.data.success && res.data.verification) {
        const verification = res.data.verification;
        setVerificationResult(verification);
        setChainStatus({
          tested: true,
          isValid: verification.isIntact,
          brokenAt: verification.violations[0] || null,
        });
      }
    } catch (err) {
      console.error('Failed to verify chain:', err);
      setChainStatus({ tested: true, isValid: false });
      setVerificationResult(null);
    } finally {
      setVerifying(false);
    }
  };

  const downloadCertificate = () => {
    if (!verificationResult?.certificate) return;

    const blob = new Blob([verificationResult.certificate], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-chain-certificate-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredEvents = events.filter((ev) => {
    const text = (
      ev.eventType +
      (ev.user?.email || '') +
      (ev.device?.deviceName || '') +
      JSON.stringify(ev.details || '')
    ).toLowerCase();
    return text.includes(searchQuery.toLowerCase());
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Audit & Provenance Ledger</h1>
            <p className="text-gray-500 text-sm mt-1">
              Immutable, tamper-evident cryptographic event logging for organizational security and compliance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyChain}
              disabled={verifying}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                chainStatus?.isValid
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {verifying ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  <span>Verifying SHA-256 Hashes...</span>
                </>
              ) : chainStatus?.isValid ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Chain Verified: Tamper-Free</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Audit Chain Integrity</span>
                </>
              )}
            </button>
            <button
              onClick={fetchAuditLogs}
              className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 bg-white"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chain verification alert */}
        {chainStatus && chainStatus.tested && (
          <div
            className={`p-5 rounded-xl border text-sm ${
              chainStatus.isValid
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {chainStatus.isValid ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className={`font-semibold text-base mb-1 ${chainStatus.isValid ? 'text-emerald-900' : 'text-rose-900'}`}>
                  {chainStatus.isValid
                    ? '✓ Chain Intact — Cryptographic Verification Passed'
                    : '✗ TAMPERING DETECTED — Chain Integrity Compromised'}
                </div>
                
                {verificationResult && (
                  <div className={`text-xs space-y-2 ${chainStatus.isValid ? 'text-emerald-800' : 'text-rose-800'}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
                      <div>
                        <div className="opacity-70 text-xs mb-0.5">Events Verified</div>
                        <div className="font-bold text-lg">{verificationResult.totalEvents.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs mb-0.5">Verification Time</div>
                        <div className="font-bold text-lg">{verificationResult.verificationDurationMs}ms</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs mb-0.5">Violations Found</div>
                        <div className="font-bold text-lg">{verificationResult.violations.length}</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs mb-0.5">Verified At</div>
                        <div className="font-bold text-sm">{new Date(verificationResult.verifiedAt).toLocaleTimeString()}</div>
                      </div>
                    </div>

                    {chainStatus.isValid ? (
                      <div className="bg-emerald-100/50 rounded-lg p-3 mt-3">
                        <p className="leading-relaxed">
                          All {verificationResult.totalEvents} audit events have been cryptographically verified using SHA-256 hash chain validation.
                          No tampering, backdating, or unauthorized modifications detected. This audit log is suitable for compliance reporting under
                          SOX, HIPAA, GDPR, ISO 27001, and PCI DSS frameworks.
                        </p>
                        {verificationResult.certificate && (
                          <button
                            onClick={downloadCertificate}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Download Compliance Certificate
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-rose-100/50 rounded-lg p-3 mt-3 space-y-2">
                        <p className="leading-relaxed font-medium">
                          ⚠ Critical Security Alert: {verificationResult.violations.length} integrity violation(s) detected in the audit chain.
                        </p>
                        <div className="text-xs opacity-90">
                          This indicates possible tampering, manual database modifications, or hash computation errors. 
                          Immediate investigation required. All affected events are listed below.
                        </div>
                      </div>
                    )}

                    {/* Violations Detail */}
                    {verificationResult.violations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="font-semibold text-rose-900 mb-2">Violation Details:</div>
                        {verificationResult.violations.map((violation, idx) => (
                          <div key={idx} className="bg-white border border-rose-300 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-rose-900">
                                Violation #{idx + 1} at Event Index {violation.eventIndex}
                              </span>
                              <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-mono text-[10px]">
                                {violation.violationType}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10px]">
                              <div>
                                <span className="text-rose-700">Event ID:</span> {violation.eventId}
                              </div>
                              <div>
                                <span className="text-rose-700">Event Type:</span> {violation.eventType}
                              </div>
                              <div className="col-span-2">
                                <span className="text-rose-700">Timestamp:</span> {new Date(violation.timestamp).toLocaleString()}
                              </div>
                              
                              {violation.violationType === 'HASH_MISMATCH' && (
                                <>
                                  <div className="col-span-2">
                                    <span className="text-rose-700">Expected Hash:</span>
                                    <div className="text-emerald-700 break-all">{violation.expectedHash}</div>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-rose-700">Actual Hash:</span>
                                    <div className="text-rose-700 break-all">{violation.actualHash}</div>
                                  </div>
                                </>
                              )}
                              
                              {violation.violationType === 'CHAIN_BREAK' && (
                                <>
                                  <div className="col-span-2">
                                    <span className="text-rose-700">Expected Previous Hash:</span>
                                    <div className="text-emerald-700 break-all">{violation.expectedPreviousHash}</div>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-rose-700">Actual Previous Hash:</span>
                                    <div className="text-rose-700 break-all">{violation.actualPreviousHash}</div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search event type, user email, device name, or payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="px-3.5 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Event Types</option>
            <option value="USER_LOGIN">User Logins</option>
            <option value="DEVICE_ENROLLED">Device Enrolled</option>
            <option value="REMOTE_ACTION_INITIATED">Remote Actions</option>
            <option value="SETTINGS_CHANGED">Settings Changes</option>
            <option value="DATA_EXPORTED">Evidence Exports</option>
          </select>
        </div>

        {/* Audit Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-3 text-sm text-gray-500 font-medium">Loading ledger events...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              No audit events matched your filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="py-3 px-6">Timestamp</th>
                    <th className="py-3 px-6">Event Type</th>
                    <th className="py-3 px-6">Actor</th>
                    <th className="py-3 px-6">Target Device</th>
                    <th className="py-3 px-6">SHA-256 Proof</th>
                    <th className="py-3 px-6 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEvents.map((ev) => {
                    const isExpanded = expandedId === ev.id;
                    return (
                      <tr key={ev.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3.5 px-6 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {new Date(ev.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-800">
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-xs font-medium text-gray-800">
                          {ev.user ? (
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              {ev.user.email}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">System / Agent</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-xs font-medium text-gray-800">
                          {ev.device ? (
                            <span className="flex items-center gap-1.5 font-mono">
                              <Monitor className="w-3.5 h-3.5 text-gray-400" />
                              {ev.device.deviceName}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 font-mono text-xs text-gray-400 truncate max-w-[120px]" title={ev.eventHash}>
                          {ev.eventHash.substring(0, 12)}...
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            {isExpanded ? 'Hide' : 'Inspect'}
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detailed Event Inspection Drawer if active */}
        {expandedId && (
          <div className="bg-gray-900 rounded-2xl p-6 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <Key className="w-4 h-4" />
                <span>Event Provenance Hash Chain Metadata</span>
              </div>
              <button
                onClick={() => setExpandedId(null)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Close Inspector
              </button>
            </div>
            {(() => {
              const activeEvent = events.find((e) => e.id === expandedId);
              if (!activeEvent) return null;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-400">Record ID:</span> {activeEvent.id}
                    </div>
                    <div>
                      <span className="text-gray-400">Event Hash:</span>{' '}
                      <span className="text-indigo-300 break-all">{activeEvent.eventHash}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Previous Parent Hash:</span>{' '}
                      <span className="text-amber-300 break-all">{activeEvent.previousHash || 'GENESIS'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-1">Payload Details:</span>
                    <pre className="p-3 bg-black/50 rounded-lg text-emerald-300 overflow-x-auto max-h-40">
                      {JSON.stringify(activeEvent.details || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Layout>
  );
}
