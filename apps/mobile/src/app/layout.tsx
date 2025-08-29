'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { ClientProviders } from '@/components/providers/client-providers';
import { Toaster } from '@/components/ui/toaster';
import { ClientOnly } from '@/components/client-only';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Amp Session Manager</title>
        <meta name="description" content="Mobile interface for managing Amp coding sessions" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AmpSM" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={inter.className}>
        <ClientOnly fallback={
          <div className="flex flex-col min-h-screen bg-background">
            <main className="flex-1 safe-area-inset mobile-scroll">
              <div className="flex items-center justify-center h-screen">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            </main>
          </div>
        }>
          <ClientProviders>
            <div className="flex flex-col min-h-screen bg-background">
              <main className="flex-1 safe-area-inset mobile-scroll">
                {children}
              </main>
            </div>
            <Toaster />
          </ClientProviders>
        </ClientOnly>
      </body>
    </html>
  );
}
