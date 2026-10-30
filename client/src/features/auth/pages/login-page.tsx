import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { Brand } from "../../../components/layout/brand";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TextField } from "../../../components/ui/text-field";
import { ApiError, TransportError } from "../../../lib/api-client";
import { useCurrentCreator, useLogin } from "../hooks/use-auth";

function returnPath(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return "/";
  }

  const from = state.from;
  if (
    typeof from === "object" &&
    from !== null &&
    "pathname" in from &&
    typeof from.pathname === "string" &&
    from.pathname.startsWith("/") &&
    !from.pathname.startsWith("//")
  ) {
    return `${from.pathname}${"search" in from && typeof from.search === "string" ? from.search : ""}`;
  }

  return "/";
}

export function LoginPage() {
  const [accessCode, setAccessCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [formError, setFormError] = useState<string>();
  const location = useLocation();
  const navigate = useNavigate();
  const currentCreator = useCurrentCreator();
  const login = useLogin();

  if (currentCreator.data) {
    return <Navigate replace to={returnPath(location.state)} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    try {
      await login.mutateAsync(accessCode);
      await navigate(returnPath(location.state), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError("That access code wasn't recognized. Check it and try again.");
      } else if (error instanceof TransportError) {
        setFormError("LiveOrder couldn't be reached. Check your connection and try again.");
      } else {
        setFormError("We couldn't sign you in. Please try again.");
      }
    }
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.8fr)]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-24 size-96 rounded-full border border-white/10" />
        <div className="absolute -right-4 top-16 size-72 rounded-full border border-white/10" />
        <div className="relative">
          <Brand inverse />
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-200">Your selling workspace</p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-tight">
            Keep every Live sale moving.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-white/75">
            Organize your products, customer orders, and payment follow-up in one clear place.
          </p>
        </div>
        <p className="relative text-sm text-white/55">Built for the people behind the camera.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div className="mb-8">
                <p className="text-sm font-semibold text-brand-700">Welcome back</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Sign in to LiveOrder</h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">
                  Enter the access code provided for your seller account.
                </p>
              </div>

              {formError && (
                <div className="mb-5">
                  <Notice title={formError} />
                </div>
              )}
              {currentCreator.isError && !(currentCreator.error instanceof ApiError && currentCreator.error.status === 401) && (
                <div className="mb-5">
                  <Notice title="We couldn't check your existing session. You can still try signing in." tone="info" />
                </div>
              )}

              <form className="grid gap-5" onSubmit={handleSubmit}>
                <TextField
                  autoComplete="off"
                  autoFocus
                  label="Access code"
                  name="accessCode"
                  onChange={(event) => setAccessCode(event.currentTarget.value)}
                  placeholder="Enter your access code"
                  required
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                />
                <label className="-mt-2 inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-muted">
                  <input
                    checked={showCode}
                    className="size-4 accent-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    onChange={(event) => setShowCode(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  Show access code
                </label>
                <Button className="w-full" disabled={login.isPending} size="lg" type="submit">
                  {login.isPending ? "Signing in…" : "Continue"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
