'use client';

import { ConfirmationProvider } from '@/components/ui/ConfirmationProvider';
import { SessionProvider } from 'next-auth/react';
import { LanguageProvider } from './LanguageProvider';
import { ThemeProvider } from './ThemeProvider';

export interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <LanguageProvider>
        <ThemeProvider><ConfirmationProvider>{children}</ConfirmationProvider></ThemeProvider>
      </LanguageProvider>
    </SessionProvider>
  );
}
