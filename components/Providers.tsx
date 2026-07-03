'use client';

import { SessionProvider } from 'next-auth/react';
import { AudienceThemeProvider } from './AudienceThemeProvider';
import { ThemeProvider } from './ThemeProvider';

export interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AudienceThemeProvider>{children}</AudienceThemeProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
