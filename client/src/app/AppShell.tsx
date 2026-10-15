export function AppShell() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">
            LiveOrder
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
            Frontend foundation ready
          </h1>
          <p className="mt-4 text-base text-slate-600">
            This application shell is intentionally minimal while the authentication,
            Live, product, and order stages are implemented in later steps.
          </p>
        </div>
      </div>
    </main>
  );
}
