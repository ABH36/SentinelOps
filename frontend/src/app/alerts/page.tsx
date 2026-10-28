'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  ExternalLink,
  Shield,
  Activity,
  Check,
  RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';

interface AlertItem {
  id: string;
  title: string;
  description?: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED';
  category: string;
  details?: Record<string, any>;
  remediation?: Record<string, any>;
  occurrenceCount: number;
  firstOccurrenceAt?: string;
  lastOccurrenceAt?: string;
  createdAt: string;
  device?: {
    id: string;
    deviceId: string;
    deviceName: string;
    platform: string;
    status: string;
  };
  policy?: {
    id: string;
    name: string;
  };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();

    // SSE Realtime Updates
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${apiUrl}/events/stream`);
      eventSource.addEventListener('device:heartbeat', () => {
        // Heartbeats may trigger new alerts, refresh periodically
      });
    } catch (err) {
      // Ignore SSE blip
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/alerts');
      setAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (alertId: string, status: 'ACKNOWLEDGED' | 'RESOLVED') => {
    try {
      await api.patch(`/alerts/${alertId}/status`, {
        status,
        note: `Handled via SentinelOps Enterprise Security Console`,
      });
      setActionSuccess(`Alert marked as ${status.toLowerCase()}`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchAlerts();
    } catch (err: any) {
      alert(`Failed to update alert: ${err.message || 'Error'}`);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const matchSearch =
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.device?.deviceName || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      const matchCategory = categoryFilter === 'ALL' || a.category === categoryFilter;

      return matchSearch && matchSeverity && matchStatus && matchCategory;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter, categoryFilter]);

  const severityCounts = useMemo(() => {
    return {
      critical: alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'OPEN').length,
      warning: alerts.filter((a) => (a.severity === 'WARNING' || a.severity === 'ERROR') && a.status === 'OPEN').length,
      resolved: alerts.filter((a) => a.status === 'RESOLVED').length,
      totalOpen: alerts.filter((a) => a.status === 'OPEN').length,
    };
  }, [alerts]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
            CRITICAL
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            ERROR
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            INFO
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
            Active / Open
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
            Investigating
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            Resolved
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-rose-600" />
              Security & Compliance Alerts
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Automated detection of prohibited software, geofence breaches, hardware overheat, and policy violations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAlerts}
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
              Refresh Alerts
            </button>
          </div>
        </div>

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            {actionSuccess}
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm bg-gradient-to-br from-rose-50/50 to-white">
            <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Critical Alerts</div>
            <div className="mt-2 text-3xl font-extrabold text-rose-600">{severityCounts.critical}</div>
            <div className="text-xs text-gray-500 mt-1">Requires immediate remediation</div>
          </div>

          <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Warnings & Errors</div>
            <div className="mt-2 text-3xl font-extrabold text-amber-600">{severityCounts.warning}</div>
            <div className="text-xs text-gray-500 mt-1">Health & posture discrepancies</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Active / Open</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{severityCounts.totalOpen}</div>
            <div className="text-xs text-gray-500 mt-1">Across all enrolled endpoints</div>
          </div>

          <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Resolved Incidents</div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-600">{severityCounts.resolved}</div>
            <div className="text-xs text-emerald-700 mt-1">Audited compliance restored</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search alerts by incident title, endpoint, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical Only</option>
                <option value="ERROR">Error</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open Only</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="SECURITY">Security Watchdog</option>
                <option value="COMPLIANCE">Geofence / Compliance</option>
                <option value="PERFORMANCE">Hardware Thermals</option>
                <option value="DEVICE_OFFLINE">Connectivity</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alerts Feed */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 text-sm">
              Loading security alerts...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900">Zero Open Incidents</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                All connected endpoints are fully compliant with corporate security policies and operating perimeters.
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${
                  alert.status === 'OPEN'
                    ? alert.severity === 'CRITICAL'
                      ? 'border-rose-300 bg-rose-50/20'
                      : alert.severity === 'WARNING'
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-gray-200'
                    : 'border-gray-200 opacity-70'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {getSeverityBadge(alert.severity)}
                      {getStatusBadge(alert.status)}
                      <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                        {alert.category}
                      </span>
                      {alert.occurrenceCount > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {alert.occurrenceCount}x occurred
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-gray-900 leading-snug">
                      {alert.title}
                    </h3>

                    {alert.description && (
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {alert.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-gray-500">
                      {alert.device && (
                        <Link
                          href={`/devices/${alert.device.id}`}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Target: {alert.device.deviceName} ({alert.device.platform})
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      <span>
                        First detected: {alert.firstOccurrenceAt ? new Date(alert.firstOccurrenceAt).toLocaleString() : new Date(alert.createdAt).toLocaleString()}
                      </span>
                      {alert.lastOccurrenceAt && (
                        <span>
                          Last active: {new Date(alert.lastOccurrenceAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                    {alert.status === 'OPEN' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(alert.id, 'ACKNOWLEDGED')}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(alert.id, 'RESOLVED')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Resolve
                        </button>
                      </>
                    )}
                    {alert.status === 'ACKNOWLEDGED' && (
                      <button
                        onClick={() => handleUpdateStatus(alert.id, 'RESOLVED')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Resolve Incident
                      </button>
                    )}
                    {alert.device && (
                      <Link
                        href={`/devices/${alert.device.id}`}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                      >
                        Device 360
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
