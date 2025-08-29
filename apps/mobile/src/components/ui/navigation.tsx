'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Plus, Settings, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { href: '/', icon: Home, label: 'Sessions' },
  { href: '/sessions/new', icon: Plus, label: 'New' },
  { href: '/threads', icon: MessageSquare, label: 'Threads' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-bottom">
      <div className="flex">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center py-2 px-1 touch-target mobile-tap',
                'transition-colors duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5 mb-1" />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
