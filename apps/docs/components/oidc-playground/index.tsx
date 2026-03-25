'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const LazyAuthRequestForm = dynamic(() => import('./auth-request-form'), {
  ssr: false,
  loading: () => (
    <div className="not-prose my-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="animate-pulse">
        <div className="mb-4 h-6 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="space-y-4">
          <div className="h-10 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-10 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-10 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-12 rounded bg-blue-200 dark:bg-blue-700" />
        </div>
      </div>
    </div>
  ),
});

export function AuthRequestForm() {
  return (
    <Suspense
      fallback={
        <div className="not-prose my-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="py-8 text-center">
            <div className="text-lg text-neutral-600 dark:text-neutral-400">Loading OIDC Playground...</div>
          </div>
        </div>
      }
    >
      <LazyAuthRequestForm />
    </Suspense>
  );
}
