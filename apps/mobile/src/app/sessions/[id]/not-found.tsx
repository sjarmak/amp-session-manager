'use client';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
      <p className="text-lg text-muted-foreground mb-4">Session not found</p>
      <button
        onClick={() => window.history.back()}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg"
      >
        Go Back
      </button>
    </div>
  );
}
