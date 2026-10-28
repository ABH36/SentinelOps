'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/layout';
import { Monitor, CheckCircle, XCircle, Clock, UserPlus } from 'lucide-react';
import api from '@/lib/api';

interface DeviceStats {
  total: number;
  active: number;
  offline: number;
  enrolling: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DeviceStats>({
    total: 0,
    active: 0,
    offline: 0,
    enrolling: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/devices');
      const devices = response.data;

      setStats({
        total: devices.length,
        active: devices.filter((d: any) => d.status === 'ACTIVE').length,
        offline: devices.filter((d: any) => d.status === 'OFFLINE').length,
        enrolling: devices.filter((d: any) => d.status === 'ENROLLING').length,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Devices',
      value: stats.total,
      icon: Monitor,
      color: 'bg-blue-500',
    },
    {
      title: 'Active',
      value: stats.active,
      icon: CheckCircle,
      color: 'bg-green-500',
    },
    {
      title: 'Offline',
      value: stats.offline,
      icon: XCircle,
      color: 'bg-red-500',
    },
    {
      title: 'Enrolling',
      value: stats.enrolling,
      icon: Clock,
      color: 'bg-yellow-500',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your device fleet</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">{card.title}</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
                      </div>
                      <div className={`${card.color} p-3 rounded-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a
                  href="/enrollment"
                  className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <UserPlus className="w-5 h-5 text-primary-600" />
                  <span className="font-medium">Enroll New Device</span>
                </a>
                <a
                  href="/devices"
                  className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Monitor className="w-5 h-5 text-primary-600" />
                  <span className="font-medium">View All Devices</span>
                </a>
                <a
                  href="/audit"
                  className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Clock className="w-5 h-5 text-primary-600" />
                  <span className="font-medium">View Audit Logs</span>
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
