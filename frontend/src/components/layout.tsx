'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth';
import { Layout as DashboardLayout } from '@/components/ui/layout';

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push('/login');
    }
  }, [mounted, isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const menuItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Devices', href: '/devices', icon: 'Monitor' },
    { label: 'Enrollment', href: '/enrollment', icon: 'UserPlus' },
    { label: 'Policies', href: '/policies', icon: 'Shield' },
    { label: 'Alerts', href: '/alerts', icon: 'AlertTriangle' },
    { label: 'Audit Logs', href: '/audit', icon: 'FileText' },
  ];

  return (
    <DashboardLayout
      user={user}
      menuItems={menuItems}
      onLogout={handleLogout}
    >
      {children}
    </DashboardLayout>
  );
}
