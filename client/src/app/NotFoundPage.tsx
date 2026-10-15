export function NotFoundPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-3 text-slate-600">
          The requested route does not exist in the current frontend foundation.
        </p>
      </div>
    </main>
  );
}
