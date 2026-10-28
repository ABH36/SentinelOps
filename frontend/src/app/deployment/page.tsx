'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout';
import {
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  ExternalLink,
  Monitor,
  Smartphone,
  Calendar,
  User,
  Tag,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';

interface EnrollmentToken {
  id: string;
  token: string;
  label: string;
  platform: 'windows' | 'android' | 'both';
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  maxUses?: number;
  deviceId?: string;
  deviceName?: string;
  enrolledAt?: string;
  revokedAt?: string;
}

export default function DeploymentPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/enrollment/tokens');
      setTokens(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch deployment tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!confirm('Are you sure you want to revoke this enrollment token? This action cannot be undone.')) {
      return;
    }

    try {
      setRevoking(token);
      await api.delete(`/enrollment/token/${token}`);
      await fetchTokens(); // Refresh list
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to revoke token');
    } finally {
      setRevoking(null);
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);

    // Check if expired
    if (status === 'PENDING' && expiry < now) {
      status = 'EXPIRED';
    }

    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
            <Clock className="w-3 h-3" />
            PENDING
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
            <CheckCircle className="w-3 h-3" />
            USED
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
            <AlertCircle className="w-3 h-3" />
            EXPIRED
          </span>
        );
      case 'REVOKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-semibold rounded-full">
            <XCircle className="w-3 h-3" />
            REVOKED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
            {status}
          </span>
        );
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'windows':
        return <Monitor className="w-4 h-4 text-blue-600" />;
      case 'android':
        return <Smartphone className="w-4 h-4 text-emerald-600" />;
      case 'both':
        return (
          <div className="flex items-center gap-1">
            <Monitor className="w-3.5 h-3.5 text-blue-600" />
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
          </div>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpiringSoon = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry > 0 && hoursUntilExpiry < 24;
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Deployment Tracking</h1>
            <p className="text-gray-500 text-sm mt-1">
              Monitor enrollment tokens, track device deployments, and manage token lifecycle.
            </p>
          </div>
          <button
            onClick={fetchTokens}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Tokens</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{tokens.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Tag className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {tokens.filter((t) => t.status === 'ACTIVE').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {tokens.filter((t) => t.status === 'PENDING' && new Date(t.expiresAt) > new Date()).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expired</p>
                <p className="text-2xl font-bold text-gray-600 mt-1">
                  {
                    tokens.filter(
                      (t) => (t.status === 'PENDING' && new Date(t.expiresAt) < new Date()) || t.status === 'EXPIRED',
                    ).length
                  }
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tokens Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Label
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Enrolled Device
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Loading deployment tokens...
                    </td>
                  </tr>
                ) : tokens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="font-semibold text-gray-800">No deployment tokens yet</p>
                      <p className="text-xs mt-1">Generate install links to start deploying agents</p>
                    </td>
                  </tr>
                ) : (
                  tokens.map((token) => (
                    <tr key={token.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900">{token.label}</span>
                          <span className="text-xs text-gray-500 font-mono mt-0.5">{token.token.slice(0, 16)}...</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(token.platform)}
                          <span className="text-sm text-gray-700 capitalize">{token.platform}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(token.status, token.expiresAt)}
                        {token.status === 'PENDING' && isExpiringSoon(token.expiresAt) && (
                          <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Expiring soon
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">{formatDate(token.createdAt)}</span>
                          <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" />
                            {token.createdBy}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">{formatDate(token.expiresAt)}</span>
                          {token.maxUses && (
                            <span className="text-xs text-gray-500 mt-0.5">Max uses: {token.maxUses}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {token.deviceId && token.deviceName ? (
                          <button
                            onClick={() => router.push(`/devices/${token.deviceId}`)}
                            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold group"
                          >
                            <span>{token.deviceName}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Not enrolled</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {token.status === 'PENDING' && new Date(token.expiresAt) > new Date() && (
                            <button
                              onClick={() => handleRevoke(token.token)}
                              disabled={revoking === token.token}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Revoke Token"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Deployment Token Lifecycle</h3>
              <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                <strong>PENDING:</strong> Token is active and waiting for device enrollment.{' '}
                <strong>USED:</strong> Device successfully enrolled with this token.{' '}
                <strong>EXPIRED:</strong> Token validity period has passed.{' '}
                <strong>REVOKED:</strong> Token was manually revoked by an administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
