'use client';

import { SessionProvider } from 'next-auth/react';
import { AudienceThemeProvider } from './AudienceThemeProvider';

export interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <AudienceThemeProvider>{children}</AudienceThemeProvider>
    </SessionProvider>
  );
}
