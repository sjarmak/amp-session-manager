'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold text-destructive mb-2">Error</h1>
      <p className="text-lg text-muted-foreground mb-4">Something went wrong</p>
      <button
        onClick={() => reset()}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg"
      >
        Try Again
      </button>
    </div>
  );
}
