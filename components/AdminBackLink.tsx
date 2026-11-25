'use client';

import { ArrowLeft } from 'lucide-react';
import { useUiLanguage } from '@/components/LanguageProvider';
import { ButtonLink } from '@/components/ui/controls';

export default function AdminBackLink() {
  const { language } = useUiLanguage();
  return <ButtonLink href="/admin">
    <ArrowLeft aria-hidden="true" />
    {language.startsWith('zh') ? '返回系统管理' : 'Back to system management'}
  </ButtonLink>;
}
