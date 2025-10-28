'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import RoleToggle from '@/components/RoleToggle';
import UserProfile from '@/components/UserProfile';

export default function HRHeader({ currentUser, actionLabel = 'Dashboard', actionHref = '/hr/dashboard' }) {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AITF</h1>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="hidden sm:flex items-center space-x-2">
              <Link href={actionHref}>
                <Button size="sm" variant="outline" className="text-xs sm:text-sm whitespace-nowrap">
                  {actionLabel}
                </Button>
              </Link>
            </div>
            <div className="flex sm:hidden items-center space-x-2">
              <Link href={actionHref}>
                <Button size="sm" variant="outline" className="text-xs whitespace-nowrap">{actionLabel}</Button>
              </Link>
            </div>

            <RoleToggle currentRole="HR" userRoles={currentUser?.roles} />
            <UserProfile userName={currentUser?.name} />
          </div>
        </div>
      </div>
    </header>
  );
}
