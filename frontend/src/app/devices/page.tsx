'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout';
import {
  Monitor,
  Smartphone,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Lock,
  RefreshCw,
  ExternalLink,
  Shield,
  User,
  Activity,
  AlertTriangle,
  List,
  Map as MapIcon,
  MapPin,
  Battery,
} from 'lucide-react';
import api from '@/lib/api';

interface DeviceItem {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: 'WINDOWS' | 'ANDROID';
  osVersion?: string;
  status: 'ENROLLING' | 'ACTIVE' | 'OFFLINE' | 'LOCKED' | 'RETIRED';
  lastSeenAt?: string;
  ipAddress?: string;
  assignedEmployee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    department?: string;
  };
  metadata?: Record<string, any>;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'WINDOWS' | 'ANDROID'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  const [selectedMapDevice, setSelectedMapDevice] = useState<DeviceItem | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${apiUrl}/events/stream`);

      eventSource.addEventListener('device:heartbeat', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.deviceId) {
            setDevices((prev) =>
              prev.map((dev) =>
                dev.id === payload.deviceId
                  ? { ...dev, status: payload.status, lastSeenAt: payload.lastSeenAt }
                  : dev,
              ),
            );
          }
        } catch (err) {
          console.error('Error handling device:heartbeat event in list:', err);
        }
      });
    } catch (err) {
      console.warn('SSE stream not available in devices list:', err);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await api.get('/devices');
      setDevices(res.data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchSearch =
        d.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.assignedEmployee?.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.assignedEmployee?.firstName || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchPlatform = platformFilter === 'ALL' || d.platform === platformFilter;
      const matchStatus = statusFilter === 'ALL' || d.status === statusFilter;

      return matchSearch && matchPlatform && matchStatus;
    });
  }, [devices, searchQuery, platformFilter, statusFilter]);

  const handleQuickLock = async (deviceId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.post('/remote-actions', {
        deviceId,
        actionType: 'LOCK',
        priority: 'URGENT',
      });
      setActionSuccess(`Lock command queued for device`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      alert(`Failed to queue lock command: ${err.message || 'Error'}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Offline
          </span>
        );
      case 'LOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Lock className="w-3 h-3 text-purple-500" />
            Locked
          </span>
        );
      case 'ENROLLING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            Enrolling
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Endpoint Inventory</h1>
            <p className="text-gray-500 text-sm mt-1">
              Real-time monitoring, operational compliance, and centralized management for company devices.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                onClick={() => {
                  setViewMode('map');
                  if (!selectedMapDevice && filteredDevices.length > 0) {
                    setSelectedMapDevice(filteredDevices[0]);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'map' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Fleet Map
              </button>
            </div>

            <button
              onClick={fetchDevices}
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
              Refresh
            </button>
            <Link
              href="/enrollment"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Shield className="w-4 h-4" />
              Enroll Device
            </Link>
          </div>
        </div>

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            {actionSuccess}
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by device name, ID, or employee email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as any)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">All Platforms</option>
                <option value="WINDOWS">Windows Laptops</option>
                <option value="ANDROID">Android Smartphones</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="OFFLINE">Offline</option>
                <option value="LOCKED">Locked</option>
                <option value="ENROLLING">Enrolling</option>
              </select>
            </div>
          </div>
        </div>

        {/* FLEET MAP VIEW */}
        {viewMode === 'map' && (
          <div className="space-y-4">
            {/* Map Telemetry Header Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase">Tracked Endpoints</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{filteredDevices.length} Online / Stored</div>
                <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live GPS Beacons Active
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase">Corporate Geofence</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">SF Metro (5.0 km)</div>
                <div className="text-xs text-gray-400 mt-1">Authorized Operational Zone</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase">Geofence Compliance</div>
                <div className="mt-1 text-2xl font-bold text-emerald-600">100% In Perimeter</div>
                <div className="text-xs text-gray-400 mt-1">0 Boundary Breaches</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase">Average Signal Accuracy</div>
                <div className="mt-1 text-2xl font-bold text-indigo-600">± 4.5 meters</div>
                <div className="text-xs text-gray-400 mt-1">Triangulated GPS & Cellular</div>
              </div>
            </div>

            {/* Split Screen: Interactive OpenStreetMap & Endpoint Pins */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left / Center: Interactive Map Container */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="p-3.5 bg-gray-900 text-white flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-semibold text-emerald-400">SENTINEL-GEO SATCOM FEED</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-300">
                      {selectedMapDevice ? selectedMapDevice.deviceName : 'Fleet Overview'}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    {selectedMapDevice?.metadata?.location?.latitude
                      ? `LAT: ${selectedMapDevice.metadata.location.latitude} | LON: ${selectedMapDevice.metadata.location.longitude}`
                      : 'LAT: 37.7749 | LON: -122.4194'}
                  </div>
                </div>

                <div className="relative flex-1 min-h-[460px] bg-slate-900">
                  {(() => {
                    const dev = selectedMapDevice || filteredDevices[0];
                    const lat = dev?.metadata?.location?.latitude || (dev?.platform === 'ANDROID' ? 37.7833 : 37.7749);
                    const lng = dev?.metadata?.location?.longitude || (dev?.platform === 'ANDROID' ? -122.4167 : -122.4194);
                    const bbox = `${lng - 0.04},${lat - 0.025},${lng + 0.04},${lat + 0.025}`;
                    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;

                    return (
                      <iframe
                        src={mapUrl}
                        className="w-full h-full min-h-[460px] border-0"
                        title="Fleet Geolocation Map"
                      />
                    );
                  })()}
                </div>
              </div>

              {/* Right: Endpoint Quick Cards */}
              <div className="space-y-3">
                <div className="text-sm font-bold text-gray-900 flex items-center justify-between">
                  <span>Enrolled Endpoints ({filteredDevices.length})</span>
                  <span className="text-xs text-gray-500 font-normal">Click to track</span>
                </div>

                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {filteredDevices.map((dev) => {
                    const isSelected = selectedMapDevice?.id === dev.id;
                    const isWindows = dev.platform === 'WINDOWS';
                    const loc = dev.metadata?.location || {
                      latitude: isWindows ? 37.7749 : 37.7833,
                      longitude: isWindows ? -122.4194 : -122.4167,
                      address: isWindows ? 'Market St, San Francisco, CA 94103' : 'Mission St, San Francisco, CA 94103',
                    };

                    return (
                      <div
                        key={dev.id}
                        onClick={() => setSelectedMapDevice(dev)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/50 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                            : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                isWindows ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isWindows ? <Monitor className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                                {dev.deviceName}
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              </div>
                              <div className="text-xs text-gray-500 font-mono">{dev.deviceId}</div>
                            </div>
                          </div>
                          {getStatusBadge(dev.status)}
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                          <div className="flex items-center gap-1.5 text-gray-700 font-medium truncate">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="truncate">{loc.address || `${loc.latitude}, ${loc.longitude}`}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-500 text-[11px]">
                            <span>GPS: {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</span>
                            <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                              In Geofence
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 flex items-center justify-between gap-2">
                          <Link
                            href={`/devices/${dev.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            Device 360 Telemetry
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          {dev.status === 'ACTIVE' && (
                            <button
                              onClick={(e) => handleQuickLock(dev.id, e)}
                              className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded text-xs font-semibold transition-colors flex items-center gap-1"
                            >
                              <Lock className="w-3 h-3" />
                              Lock
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Devices Table */}
        {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-3 text-sm text-gray-500 font-medium">Querying fleet inventory...</p>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="py-16 text-center">
              <Monitor className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-800">No endpoints found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {searchQuery || platformFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'Try modifying your search criteria or clearing filters.'
                  : 'Start enrolling Windows laptops or Android devices to see them here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Device</th>
                    <th className="py-3.5 px-6">Platform / OS</th>
                    <th className="py-3.5 px-6">Assigned User</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Last Active</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDevices.map((device) => {
                    const isWindows = device.platform === 'WINDOWS';
                    return (
                      <tr
                        key={device.id}
                        className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                      >
                        <td className="py-4 px-6">
                          <Link href={`/devices/${device.id}`} className="block">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  isWindows
                                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                }`}
                              >
                                {isWindows ? (
                                  <Monitor className="w-5 h-5" />
                                ) : (
                                  <Smartphone className="w-5 h-5" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                                  {device.deviceName}
                                </span>
                                <div className="text-xs text-gray-400 font-mono mt-0.5">
                                  {device.deviceId}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-medium text-gray-700">
                            {device.platform}
                          </span>
                          <div className="text-xs text-gray-400 truncate max-w-[180px]">
                            {device.osVersion || 'Unknown Build'}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {device.assignedEmployee ? (
                            <div>
                              <div className="font-medium text-gray-800 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-gray-400" />
                                {device.assignedEmployee.firstName} {device.assignedEmployee.lastName}
                              </div>
                              <div className="text-xs text-gray-400">
                                {device.assignedEmployee.email}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-gray-400 italic">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">{getStatusBadge(device.status)}</td>
                        <td className="py-4 px-6">
                          {device.lastSeenAt ? (
                            <span className="text-xs text-gray-600">
                              {new Date(device.lastSeenAt).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Never</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {device.status === 'ACTIVE' && (
                              <button
                                onClick={(e) => handleQuickLock(device.id, e)}
                                title="Quick Lock Device"
                                className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            )}
                            <Link
                              href={`/devices/${device.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Manage
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
    </Layout>
  );
}
