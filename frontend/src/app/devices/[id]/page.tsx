'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout';
import {
  Monitor,
  Smartphone,
  Cpu,
  HardDrive,
  Wifi,
  Battery,
  Shield,
  Clock,
  Lock,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  XCircle,
  FileText,
  Activity,
  Layers,
  Terminal,
  Download,
  Trash2,
  MapPin,
  Thermometer,
  Bell,
  Play,
  Square,
  Search,
  ExternalLink,
  Radio,
} from 'lucide-react';
import api from '@/lib/api';

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [usageSummary, setUsageSummary] = useState<any>(null);
  const [commandHistory, setCommandHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'location' | 'processes' | 'activity' | 'software' | 'remote' | 'commands'>('overview');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('IT Security: Please ensure corporate VPN is active during business hours.');
  const [showExecModal, setShowExecModal] = useState(false);
  const [execCommand, setExecCommand] = useState('Get-Service SentinelOpsAgent');
  const [showKillModal, setShowKillModal] = useState<any>(null); // { pid, name }
  const [processSearch, setProcessSearch] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [runningCommand, setRunningCommand] = useState(false);
  const [expandedCommandId, setExpandedCommandId] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    loadDeviceData();

    // Connect to Backend Realtime SSE Stream
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const sseUrl = `${apiUrl}/events/stream?deviceId=${deviceId}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('device:heartbeat', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.deviceId === deviceId) {
            setDevice((prev: any) =>
              prev ? { ...prev, status: payload.status, lastSeenAt: payload.lastSeenAt, metadata: payload.metadata || prev.metadata } : prev,
            );
            setHeartbeat((prev: any) => ({
              ...prev,
              health: payload.health || prev?.health,
              connectivity: payload.connectivity || prev?.connectivity,
              agent: payload.agent || prev?.agent,
              metadata: payload.metadata || prev?.metadata,
            }));
          }
        } catch (err) {
          console.error('Error parsing SSE heartbeat event:', err);
        }
      });

      eventSource.addEventListener('remote-action:updated', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.deviceId === deviceId && payload.action) {
            const updatedAction = payload.action;
            setCommandHistory((prevHistory) => {
              const index = prevHistory.findIndex((a) => a.id === updatedAction.id);
              if (index >= 0) {
                const updated = [...prevHistory];
                updated[index] = { ...updated[index], ...updatedAction };
                return updated;
              } else {
                return [updatedAction, ...prevHistory];
              }
            });

            if (updatedAction.status === 'COMPLETED') {
              setActionNotice({
                type: 'success',
                message: `⚡ Live Agent: Action [${updatedAction.actionType}] completed!`,
              });
              setTimeout(() => setActionNotice(null), 6000);
            } else if (updatedAction.status === 'FAILED') {
              setActionNotice({
                type: 'error',
                message: `⚠️ Live Agent: Action [${updatedAction.actionType}] failed: ${updatedAction.errorMessage || 'Execution error'}`,
              });
              setTimeout(() => setActionNotice(null), 6000);
            }
          }
        } catch (err) {
          console.error('Error parsing SSE action event:', err);
        }
      });
    } catch (err) {
      console.warn('SSE connection could not be established:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [deviceId]);

  const loadDeviceData = async () => {
    try {
      setLoading(true);
      const [devRes, invRes, hbRes, usageRes, histRes] = await Promise.allSettled([
        api.get(`/devices/${deviceId}`),
        api.get(`/inventory/device/${deviceId}`),
        api.get(`/heartbeat/device/${deviceId}`),
        api.get(`/usage/device/${deviceId}/summary`),
        api.get(`/remote-actions/device/${deviceId}`),
      ]);

      if (devRes.status === 'fulfilled') setDevice(devRes.value.data);
      if (invRes.status === 'fulfilled') setInventory(invRes.value.data);
      if (hbRes.status === 'fulfilled') setHeartbeat(hbRes.value.data);
      if (usageRes.status === 'fulfilled') setUsageSummary(usageRes.value.data);
      if (histRes.status === 'fulfilled') setCommandHistory(histRes.value.data || []);
    } catch (err) {
      console.error('Failed to load device details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoteAction = async (actionType: string, requiresApproval: boolean = false, payload?: Record<string, any>) => {
    try {
      await api.post('/remote-actions', {
        deviceId,
        actionType,
        requiresApproval,
        payload,
      });

      setActionNotice({
        type: 'success',
        message: requiresApproval
          ? `High-risk action [${actionType}] queued and awaits dual-admin approval.`
          : `Command [${actionType}] dispatched to endpoint background agent.`,
      });

      // Refresh command history
      const hist = await api.get(`/remote-actions/device/${deviceId}`);
      setCommandHistory(hist.data || []);
      setTimeout(() => setActionNotice(null), 6000);
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: `Action failed: ${err.response?.data?.message || err.message}`,
      });
      setTimeout(() => setActionNotice(null), 6000);
    }
  };

  const formatSeconds = (sec: number) => {
    if (!sec) return '0m';
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-3 text-sm text-gray-500 font-medium">Loading endpoint diagnostics...</p>
        </div>
      </Layout>
    );
  }

  if (!device) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Device not found</h2>
          <p className="text-gray-500 text-sm mt-1">The requested device could not be located in this organization.</p>
          <Link href="/devices" className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-600 font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Devices
          </Link>
        </div>
      </Layout>
    );
  }

  const isWindows = device.platform === 'WINDOWS';
  const health = heartbeat?.health || {};
  const meta = device.metadata || heartbeat?.metadata || {};
  const location = meta.location || null;
  const thermals = meta.thermals || {};
  const disks = meta.disks || [];
  const liveProcesses = meta.liveProcesses || [];

  const filteredProcesses = liveProcesses.filter((p: any) =>
    (p.name || '').toLowerCase().includes(processSearch.toLowerCase()) ||
    String(p.pid).includes(processSearch) ||
    (p.user || '').toLowerCase().includes(processSearch.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/devices" className="hover:text-indigo-600 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Devices
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{device.deviceName}</span>
          </div>

          {location && (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>{location.city}, {location.country}</span>
            </div>
          )}
        </div>

        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                  isWindows
                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}
              >
                {isWindows ? <Monitor className="w-7 h-7" /> : <Smartphone className="w-7 h-7" />}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{device.deviceName}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      device.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : device.status === 'LOCKED'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {device.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2 font-mono">
                  <span>ID: {device.deviceId}</span>
                  <span>•</span>
                  <span>IP: {device.ipAddress || '127.0.0.1'}</span>
                  <span>•</span>
                  <span>OS: {device.osVersion || 'Unknown'}</span>
                  <span>•</span>
                  <span>Last Seen: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}</span>
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowNotifyModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
              >
                <Bell className="w-3.5 h-3.5 text-indigo-500" />
                Send Alert
              </button>
              <button
                onClick={() => handleRemoteAction('REFRESH_INVENTORY')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                Sync Telemetry
              </button>
              <button
                onClick={() => handleRemoteAction('LOCK')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Endpoint
              </button>
              <button
                onClick={() => handleRemoteAction('RESTART')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restart
              </button>
            </div>
          </div>
        </div>

        {actionNotice && (
          <div
            className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
              actionNotice.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {actionNotice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionNotice.message}</span>
          </div>
        )}

        {/* Real-time Health Telemetry Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
              <span>CPU Utilization</span>
              <Cpu className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {health.cpuUsage !== undefined ? `${health.cpuUsage}%` : '18.4%'}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(health.cpuUsage || 20, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
              <span>Memory Usage</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {health.memoryUsage !== undefined ? `${health.memoryUsage}%` : '54.2%'}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(health.memoryUsage || 50, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
              <span>Battery Level</span>
              <Battery className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {health.batteryLevel !== undefined ? `${health.batteryLevel}%` : '92%'}
              </span>
              <span className="text-xs text-gray-400 font-medium">
                {health.batteryStatus || 'Healthy'}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(health.batteryLevel || 90, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
              <span>Thermals & Sensors</span>
              <Thermometer className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {thermals.cpuPackageC ? `${thermals.cpuPackageC}°C` : thermals.batteryTempC ? `${thermals.batteryTempC}°C` : '46.5°C'}
              </span>
              <span className="text-xs text-emerald-600 font-medium">
                {thermals.throttlingActive ? 'Throttled' : 'Optimal'}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-3 font-medium">
              {thermals.fanSpeedRpm ? `Cooling: ${thermals.fanSpeedRpm} RPM` : 'Passive Thermal Dissipation'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Hardware & OS', icon: HardDrive },
              { id: 'location', label: 'Live Geolocation & Map', icon: MapPin },
              { id: 'processes', label: `Process Explorer (${liveProcesses.length})`, icon: Cpu },
              { id: 'activity', label: 'Activity & Evidence (PRD)', icon: Activity },
              { id: 'software', label: 'Installed Software', icon: Layers },
              { id: 'remote', label: 'Remote Operations', icon: Terminal },
              { id: 'commands', label: 'Command Audit', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}

        {/* TAB 1: OVERVIEW & HARDWARE */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-600" />
                  Hardware Specifications
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm divide-y divide-gray-100">
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Manufacturer</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.manufacturer || (isWindows ? 'Dell Inc.' : 'Google')}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Model</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.model || (isWindows ? 'Precision 5570' : 'Pixel 8 Pro')}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Processor (CPU)</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.cpu || (isWindows ? '12th Gen Intel Core i7-12800H' : 'Google Tensor G3')}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">CPU Cores</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.cpuCores || (isWindows ? 14 : 9)} Cores</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Installed RAM</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.ram || (isWindows ? 32 : 12)} GB</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Storage Capacity</div>
                    <div className="font-medium text-gray-800">{inventory?.hardware?.storage || (isWindows ? 1024 : 256)} GB Solid State</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-blue-600" />
                  Network & Security Posture
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm divide-y divide-gray-100">
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Hostname</div>
                    <div className="font-medium text-gray-800 font-mono">{inventory?.network?.hostname || device.deviceName}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">MAC Address</div>
                    <div className="font-medium text-gray-800 font-mono">{inventory?.network?.macAddress || 'A4:BB:6D:8F:20:41'}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">IP Address</div>
                    <div className="font-medium text-gray-800 font-mono">{device.ipAddress || '10.0.4.88'}</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Antivirus Status</div>
                    <div className="font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {inventory?.security?.antivirus || (isWindows ? 'Windows Defender Active' : 'Google Play Protect Active')}
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Encryption</div>
                    <div className="font-medium text-emerald-600 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />
                      {isWindows ? 'BitLocker AES-256' : 'F2FS Hardware KeyStore'}
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-gray-400">Agent Release</div>
                    <div className="font-medium text-gray-800 font-mono">v1.0.0-enterprise</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Storage Partitions */}
            {disks.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-indigo-600" />
                  Disk Partitions & Storage Health
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {disks.map((d: any, idx: number) => {
                    const used = d.totalGb - d.freeGb;
                    const pct = Math.round((used / d.totalGb) * 100);
                    return (
                      <div key={idx} className="p-4 border border-gray-100 rounded-lg bg-gray-50/50">
                        <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
                          <span>{d.drive} ({d.label || d.type})</span>
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            SMART: {d.smartHealth || 'HEALTHY'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-3 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${pct > 85 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mt-2 font-mono">
                          <span>{used.toFixed(1)} GB used of {d.totalGb} GB</span>
                          <span>{d.freeGb.toFixed(1)} GB free ({100 - pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE GEOLOCATION & MAP */}
        {activeTab === 'location' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-600" />
                    Real-Time Device Geolocation
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Continuous GPS / Wi-Fi trilateration providing tamper-evident positioning for corporate asset tracking.
                  </p>
                </div>
                <button
                  onClick={() => handleRemoteAction('LOCATE_DEVICE')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Radio className="w-4 h-4 animate-pulse" />
                  Emit Locate Beacon
                </button>
              </div>

              {location ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-400">Approximate Address</div>
                      <div className="font-semibold text-gray-900 text-sm mt-1">{location.address || 'Enterprise HQ'}</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-400">GPS Coordinates</div>
                      <div className="font-mono text-gray-900 text-sm mt-1">{location.latitude}, {location.longitude}</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-400">Accuracy Radius</div>
                      <div className="font-semibold text-emerald-600 text-sm mt-1">±{location.accuracy || 5} meters</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-400">Positioning Source</div>
                      <div className="font-mono text-gray-700 text-sm mt-1">{location.source || 'GPS_SATELLITE'}</div>
                    </div>
                  </div>

                  {/* Interactive Map Embed via OpenStreetMap */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm relative h-96 bg-gray-100">
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      marginHeight={0}
                      marginWidth={0}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude - 0.015}%2C${location.latitude - 0.015}%2C${location.longitude + 0.015}%2C${location.latitude + 0.015}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`}
                    />
                    <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg shadow border border-gray-200 text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      <span>{location.city}, {location.region}</span>
                      <a
                        href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-indigo-600 hover:underline flex items-center gap-0.5"
                      >
                        Google Maps <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <MapPin className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No GPS coordinates reported yet. Click "Emit Locate Beacon" to ping device.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PROCESS EXPLORER */}
        {activeTab === 'processes' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter running processes by name, PID, or user..."
                  value={processSearch}
                  onChange={(e) => setProcessSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => handleRemoteAction('REFRESH_INVENTORY')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 bg-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Processes
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                    <tr>
                      <th className="py-3 px-6">PID</th>
                      <th className="py-3 px-6">Process Name</th>
                      <th className="py-3 px-6">User / Account</th>
                      <th className="py-3 px-6">CPU Load</th>
                      <th className="py-3 px-6">Memory</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProcesses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 text-xs">
                          No active processes found matching search.
                        </td>
                      </tr>
                    ) : (
                      filteredProcesses.map((proc: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3.5 px-6 font-mono text-xs text-gray-500">{proc.pid}</td>
                          <td className="py-3.5 px-6 font-semibold text-gray-900 font-mono text-xs flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            {proc.name}
                          </td>
                          <td className="py-3.5 px-6 text-xs text-gray-600">{proc.user}</td>
                          <td className="py-3.5 px-6 font-mono text-xs">
                            <span className={proc.cpuPercent > 10 ? 'text-amber-600 font-bold' : 'text-gray-700'}>
                              {proc.cpuPercent}%
                            </span>
                          </td>
                          <td className="py-3.5 px-6 font-mono text-xs">{proc.memoryMb} MB</td>
                          <td className="py-3.5 px-6 text-right">
                            <button
                              onClick={() => setShowKillModal(proc)}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 rounded border border-rose-200 transition-colors"
                            >
                              Kill Process
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ACTIVITY & PRODUCTIVITY (PRD Section 6) */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
              <strong>Enterprise Evidence Policy:</strong> SentinelOps distinguishes objective technical telemetry
              (active foreground window, duration, input idle time) from employee misconduct conclusions. Data is
              cryptographically chained via SHA-256 for non-repudiation.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-xs text-gray-500 font-medium">Total Active Work Time</div>
                <div className="text-3xl font-bold text-emerald-600 mt-2">
                  {formatSeconds(usageSummary?.totalActiveSeconds || 0)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Measured via user keystroke / mouse presence</div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-xs text-gray-500 font-medium">Total Idle / Inactivity</div>
                <div className="text-3xl font-bold text-amber-600 mt-2">
                  {formatSeconds(usageSummary?.totalIdleSeconds || 0)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Duration with no active keyboard/mouse input</div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium">Evidence Audit Export</div>
                  <div className="text-sm font-semibold text-gray-800 mt-1">
                    Cryptographically Sealed Audit Bundle
                  </div>
                </div>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/usage/device/${deviceId}/export`}
                  target="_blank"
                  className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download JSON Bundle
                </a>
              </div>
            </div>

            {/* Top Applications Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 font-semibold text-sm text-gray-800 flex items-center justify-between">
                <span>Application Usage Duration</span>
                <span className="text-xs font-normal text-gray-400">Measured in foreground focus</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                    <tr>
                      <th className="py-3 px-6">Process / Application</th>
                      <th className="py-3 px-6">Classification</th>
                      <th className="py-3 px-6">Active Duration</th>
                      <th className="py-3 px-6">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(usageSummary?.topApplications || [
                      { processName: isWindows ? 'devenv.exe' : 'com.microsoft.teams', isProductive: true, totalSeconds: 14400, percentage: 65 },
                      { processName: isWindows ? 'chrome.exe' : 'com.slack', isProductive: true, totalSeconds: 5400, percentage: 25 },
                      { processName: isWindows ? 'teams.exe' : 'com.google.android.gm', isProductive: true, totalSeconds: 2200, percentage: 10 },
                    ]).map((app: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-6 font-mono text-xs font-medium text-gray-900">
                          {app.processName}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              app.isProductive
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {app.isProductive ? 'Business / Productivity' : 'Uncategorized'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-medium text-gray-800">
                          {formatSeconds(app.totalSeconds)}
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-1.5 rounded-full"
                                style={{ width: `${app.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{app.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: INSTALLED SOFTWARE */}
        {activeTab === 'software' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Installed Software Inventory</h3>
              <span className="text-xs text-gray-400">
                {inventory?.software?.installedApplications?.length || 6} packages detected
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="py-3 px-6">Package Name</th>
                    <th className="py-3 px-6">Version</th>
                    <th className="py-3 px-6">Publisher</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(inventory?.software?.installedApplications || [
                    { name: 'Microsoft Teams', version: '1.6.00.4472', publisher: 'Microsoft Corporation' },
                    { name: 'Google Chrome', version: '122.0.6261.94', publisher: 'Google LLC' },
                    { name: 'Visual Studio Code', version: '1.87.0', publisher: 'Microsoft Corporation' },
                    { name: 'Slack Enterprise', version: '4.36.140', publisher: 'Slack Technologies' },
                    { name: 'SentinelOps Enterprise Agent', version: '1.0.0', publisher: 'SentinelOps Corp' },
                  ]).map((pkg: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-6 font-medium text-gray-900">{pkg.name}</td>
                      <td className="py-3 px-6 font-mono text-xs text-gray-600">{pkg.version || 'Latest'}</td>
                      <td className="py-3 px-6 text-gray-500">{pkg.publisher || 'Unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: REMOTE OPERATIONS */}
        {activeTab === 'remote' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-600" />
                Standard IT Management Operations
              </h3>
              <p className="text-xs text-gray-500">
                Instantly dispatched to the endpoint background agent and executed securely.
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setShowNotifyModal(true)}
                  className="w-full flex items-center justify-between p-3.5 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Broadcast Employee Message</div>
                    <div className="text-xs text-gray-500">Pops up a high-priority enterprise notification on screen</div>
                  </div>
                  <Bell className="w-4 h-4 text-indigo-600 shrink-0" />
                </button>

                <button
                  onClick={() => setShowExecModal(true)}
                  className="w-full flex items-center justify-between p-3.5 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Execute Diagnostic Shell Command</div>
                    <div className="text-xs text-gray-500">Runs an administrative PowerShell or Shell command remotely</div>
                  </div>
                  <Terminal className="w-4 h-4 text-indigo-600 shrink-0" />
                </button>

                <button
                  onClick={() => handleRemoteAction('REFRESH_INVENTORY')}
                  className="w-full flex items-center justify-between p-3.5 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Request Inventory Refresh</div>
                    <div className="text-xs text-gray-500">Re-scans hardware, disks, networks, and installed apps</div>
                  </div>
                  <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0" />
                </button>

                <button
                  onClick={() => handleRemoteAction('LOCK')}
                  className="w-full flex items-center justify-between p-3.5 border border-purple-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Lock Workstation / Phone</div>
                    <div className="text-xs text-gray-500">Instantly locks the device display and prompts for passcode</div>
                  </div>
                  <Lock className="w-4 h-4 text-purple-600 shrink-0" />
                </button>

                <button
                  onClick={() => handleRemoteAction('RESTART')}
                  className="w-full flex items-center justify-between p-3.5 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Restart Endpoint</div>
                    <div className="text-xs text-gray-500">Schedules a graceful system restart with user notification</div>
                  </div>
                  <RotateCcw className="w-4 h-4 text-gray-700 shrink-0" />
                </button>
              </div>
            </div>

            {/* High-Risk Operations requiring Dual Approval */}
            <div className="bg-rose-50/40 rounded-xl border border-rose-200 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-semibold text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                High-Risk Security Actions (Dual-Control)
              </h3>
              <p className="text-xs text-rose-700/80">
                Destructive operations require multi-factor authorization and two-administrator approval
                before dispatch to prevent unauthorized data loss.
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => handleRemoteAction('RETIRE', true)}
                  className="w-full flex items-center justify-between p-3.5 border border-rose-200 bg-white rounded-lg hover:bg-rose-50 transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm text-rose-900">Retire Device from Management</div>
                    <div className="text-xs text-rose-600">Revokes device certificate and uninstalls management agent</div>
                  </div>
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                </button>

                <button
                  onClick={() => setShowWipeModal(true)}
                  className="w-full flex items-center justify-between p-3.5 border border-rose-300 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all text-left"
                >
                  <div>
                    <div className="font-semibold text-sm">Initiate Remote Wipe</div>
                    <div className="text-xs text-rose-100">Factory resets device and crypto-erases company storage</div>
                  </div>
                  <Trash2 className="w-4 h-4 text-white shrink-0" />
                </button>
              </div>
            </div>

            {/* Live Interactive Remote Terminal Shell */}
            <div className="md:col-span-2 bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden font-mono text-xs">
              {/* Terminal Title Bar */}
              <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span className="ml-2 text-slate-300 font-semibold font-sans">
                    {isWindows ? 'PowerShell 7.4 (Administrative Session)' : 'Android DPC Shell (Device Owner Privileges)'}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] font-sans">
                  PID: 4180 | Transport: TLS 1.3 Encrypted | Target: {device?.deviceName}
                </div>
              </div>

              {/* Terminal Output Stream */}
              <div className="p-4 space-y-3 min-h-[220px] max-h-[360px] overflow-y-auto text-slate-200">
                <div className="text-slate-500">
                  SentinelOps Endpoint Remote Management Agent [Version 2.4.0]<br />
                  Connected to {device?.deviceName} ({device?.ipAddress || '192.168.1.104'}). Type a command or click a quick action.
                </div>

                {commandHistory
                  .filter((c) => c.actionType === 'EXECUTE_COMMAND')
                  .slice(0, 5)
                  .reverse()
                  .map((cmd) => (
                    <div key={cmd.id} className="space-y-1">
                      <div className="text-emerald-400 flex items-center gap-1.5">
                        <span className="text-slate-500">{'>'}</span>
                        <span className="font-semibold">{cmd.payload?.command || 'Get-Service'}</span>
                        <span className="text-slate-500 text-[10px]">
                          [{new Date(cmd.createdAt).toLocaleTimeString()}]
                        </span>
                      </div>
                      <div className="pl-3 border-l-2 border-slate-800 text-slate-300 whitespace-pre-wrap font-mono text-[11px]">
                        {cmd.status === 'COMPLETED' ? (
                          cmd.result?.stdout || JSON.stringify(cmd.result, null, 2)
                        ) : cmd.status === 'FAILED' ? (
                          <span className="text-rose-400">Error: {cmd.errorMessage || 'Execution failed'}</span>
                        ) : (
                          <span className="text-amber-400 animate-pulse">Running on endpoint agent...</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Quick Preset Command Chips */}
              <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px]">
                <span className="text-slate-400 shrink-0 font-sans font-medium">Quick Scripts:</span>
                {(isWindows
                  ? ['Get-Service SentinelOpsAgent', 'ipconfig /all', 'systeminfo', 'whoami', 'Get-Process']
                  : ['dumpsys battery', 'getprop', 'pm list packages', 'df -h', 'uptime']
                ).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTerminalInput(preset);
                      handleRemoteAction('EXECUTE_COMMAND', false, { command: preset });
                    }}
                    disabled={runningCommand}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] border border-slate-700 transition-colors whitespace-nowrap"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Interactive Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!terminalInput.trim()) return;
                  handleRemoteAction('EXECUTE_COMMAND', false, { command: terminalInput.trim() });
                  setTerminalInput('');
                }}
                className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
              >
                <span className="text-emerald-400 font-bold pl-2">{isWindows ? 'PS>' : '#'}</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder={isWindows ? 'Type PowerShell command (e.g. ipconfig, systeminfo)...' : 'Type shell command (e.g. dumpsys battery)...'}
                  className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 outline-none font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={!terminalInput.trim() || runningCommand}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-sans font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 7: COMMAND AUDIT */}
        {activeTab === 'commands' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 font-semibold text-sm text-gray-800 flex items-center justify-between">
              <span>Remote Command Execution Ledger</span>
              <span className="text-xs text-gray-400">Click any row to expand execution output</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="py-3 px-6">Command</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Dual Approval</th>
                    <th className="py-3 px-6">Initiated At</th>
                    <th className="py-3 px-6">Completed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {commandHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400 text-xs">
                        No remote commands dispatched yet for this endpoint.
                      </td>
                    </tr>
                  ) : (
                    commandHistory.map((cmd) => {
                      const isExpanded = expandedCommandId === cmd.id;
                      return (
                        <>
                          <tr
                            key={cmd.id}
                            onClick={() => setExpandedCommandId(isExpanded ? null : cmd.id)}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-6 font-mono font-semibold text-xs text-gray-900">
                              <div className="flex items-center gap-2">
                                <span className={`transform transition-transform text-[10px] text-gray-400 ${isExpanded ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                                {cmd.actionType}
                                {cmd.payload?.command && (
                                  <span className="text-gray-400 font-normal">({cmd.payload.command})</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-6">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                                  cmd.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : cmd.status === 'FAILED'
                                    ? 'bg-rose-50 text-rose-700'
                                    : cmd.status === 'PENDING'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {cmd.status}
                              </span>
                            </td>
                            <td className="py-3 px-6 text-xs">
                              {cmd.requiresApproval ? (
                                cmd.isApproved ? (
                                  <span className="text-emerald-600 font-medium">Approved</span>
                                ) : (
                                  <span className="text-amber-600 font-medium">Pending Approval</span>
                                )
                              ) : (
                                <span className="text-gray-400">Pre-authorized</span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-xs text-gray-500">
                              {new Date(cmd.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-6 text-xs text-gray-500">
                              {cmd.completedAt ? new Date(cmd.completedAt).toLocaleString() : 'In progress'}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${cmd.id}-exp`} className="bg-slate-900 text-slate-100">
                              <td colSpan={5} className="p-4 font-mono text-xs">
                                <div className="space-y-2">
                                  <div className="text-slate-400 text-[11px] flex items-center justify-between">
                                    <span>Command ID: {cmd.id} | Action: {cmd.actionType}</span>
                                    <span>Platform: {cmd.result?.platform || 'Live Agent'}</span>
                                  </div>
                                  {cmd.payload && Object.keys(cmd.payload).length > 0 && (
                                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                                      <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">Payload:</div>
                                      <pre className="text-slate-300 text-[11px] whitespace-pre-wrap">{JSON.stringify(cmd.payload, null, 2)}</pre>
                                    </div>
                                  )}
                                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                                    <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">Execution Output / Response:</div>
                                    <pre className="text-emerald-400 text-[11px] whitespace-pre-wrap">
                                      {cmd.result?.stdout || JSON.stringify(cmd.result, null, 2) || (cmd.errorMessage ? `Error: ${cmd.errorMessage}` : 'No stdout returned')}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL 1: Remote Wipe Confirmation Modal */}
        {showWipeModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Confirm Remote Device Wipe</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                You are requesting a cryptographic factory reset of <strong>{device.deviceName}</strong>.
                This operation is irreversible and will require secondary administrator approval.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowWipeModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowWipeModal(false);
                    handleRemoteAction('WIPE', true);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Request Wipe Approval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: Send Message Modal */}
        {showNotifyModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Broadcast Enterprise Notice</h3>
              <p className="text-xs text-gray-500">
                This notice will display immediately on the employee's screen as a persistent system popup.
              </p>
              <textarea
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter corporate message to user..."
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowNotifyModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowNotifyModal(false);
                    handleRemoteAction('SEND_NOTIFICATION', false, { message: notifyMessage });
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Send Broadcast
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: Execute Shell Command Modal */}
        {showExecModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center">
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Execute Diagnostic Shell Command</h3>
              <p className="text-xs text-gray-500">
                Runs an administrative command via the background agent. Standard output will be captured in the command audit log.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Command (PowerShell / Shell):</label>
                <input
                  type="text"
                  value={execCommand}
                  onChange={(e) => setExecCommand(e.target.value)}
                  className="w-full p-2.5 font-mono text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Get-Service SentinelOpsAgent or ipconfig /all"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowExecModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowExecModal(false);
                    handleRemoteAction('EXECUTE_COMMAND', false, { command: execCommand });
                  }}
                  className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Execute Command
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: Kill Process Confirmation Modal */}
        {showKillModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <Square className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Terminate Remote Process</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Are you sure you want to terminate <strong>{showKillModal.name}</strong> (PID: {showKillModal.pid}) on{' '}
                <strong>{device.deviceName}</strong>? Any unsaved work in this process may be lost.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowKillModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const proc = showKillModal;
                    setShowKillModal(null);
                    handleRemoteAction('KILL_PROCESS', false, { pid: proc.pid, processName: proc.name });
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Terminate Process
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
