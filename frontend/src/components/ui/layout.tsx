'use client';

import { ReactNode } from 'react';
import { Sidebar } from './sidebar';

export interface MenuItem {
  label: string;
  href: string;
  icon: string;
}

interface LayoutProps {
  children: ReactNode;
  user: any;
  menuItems: MenuItem[];
  onLogout: () => void;
}

export function Layout({ children, user, menuItems, onLogout }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar menuItems={menuItems} onLogout={onLogout} user={user} />
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
