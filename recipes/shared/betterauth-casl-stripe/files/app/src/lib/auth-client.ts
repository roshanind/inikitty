import { createAuthClient } from 'better-auth/react';

/** Matches the API's `basePath: '/auth'` in api/src/auth/auth.ts — must stay in sync by hand. */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  basePath: '/auth',
});

export const { useSession, signIn, signUp, signOut } = authClient;
