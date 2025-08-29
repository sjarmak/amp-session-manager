'use client';

import React from 'react';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        {children}
      </QueryProvider>
    </ThemeProvider>
  );
}
