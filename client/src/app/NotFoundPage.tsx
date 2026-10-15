import { Link } from "react-router-dom";

import { Brand } from "../components/layout/brand";
import { buttonClassName } from "../components/ui/button-styles";
import { Card, CardContent } from "../components/ui/card";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6"><Brand /></div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-brand-700">404</p>
            <h1 className="mt-3 text-2xl font-bold text-ink">We couldn't find that page</h1>
            <p className="mt-2 text-sm text-ink-muted">The address may be incorrect or the page may have moved.</p>
            <Link className={`${buttonClassName("primary")} mt-6`} to="/">Go to LiveOrder</Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
