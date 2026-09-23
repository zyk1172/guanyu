import NextAuthImport from 'next-auth';

const NextAuth = ((NextAuthImport as unknown as { default?: typeof NextAuthImport }).default ?? NextAuthImport) as typeof NextAuthImport;
import { authOptions } from '@/lib/auth';

export default NextAuth(authOptions);
