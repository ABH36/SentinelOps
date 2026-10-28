'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Monitor, UserPlus, FileText, Settings, LogOut, User, Shield, AlertTriangle, MapPin } from 'lucide-react';

interface MenuItem {
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  menuItems: MenuItem[];
  onLogout: () => void;
  user: any;
}

export function Sidebar({ menuItems, onLogout, user }: SidebarProps) {
  const pathname = usePathname();

  const icons: { [key: string]: any } = {
    LayoutDashboard,
    Monitor,
    UserPlus,
    FileText,
    Settings,
    Shield,
    AlertTriangle,
    MapPin,
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <User className="w-6 h-6" />
          SentinelOps
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = icons[item.icon];
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-4 px-4">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
            {user?.firstName?.[0] || user?.email?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.firstName || user?.email}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2 w-full text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );
}
