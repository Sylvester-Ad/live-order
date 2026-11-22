import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { Brand } from "../../../components/layout/brand";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TextField } from "../../../components/ui/text-field";
import { ApiError, TransportError } from "../../../lib/api-client";
import { useCurrentCreator, useLogin } from "../hooks/use-auth";

function returnPath(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/dashboard";
  const from = state.from;
  if (typeof from === "object" && from !== null && "pathname" in from && typeof from.pathname === "string" && from.pathname.startsWith("/") && !from.pathname.startsWith("//")) {
    return `${from.pathname}${"search" in from && typeof from.search === "string" ? from.search : ""}`;
  }
  return "/dashboard";
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string>();
  const location = useLocation();
  const navigate = useNavigate();
  const currentCreator = useCurrentCreator();
  const login = useLogin();

  if (currentCreator.data) return <Navigate replace to={returnPath(location.state)} />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    try {
      await login.mutateAsync({ email, password });
      await navigate(returnPath(location.state), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setFormError("Email or password is incorrect. Unclaimed sellers can claim their existing account below.");
      else if (error instanceof TransportError) setFormError("LiveOrder couldn't be reached. Check your connection and try again.");
      else setFormError("We couldn't sign you in. Please try again.");
    }
  }

  return (
    <AuthFrame eyebrow="Your selling workspace" headline="Manage every Store in one place." description="Keep products, customer orders, and payment follow-up organized in one clear workspace.">
      <div className="mb-8">
        <p className="text-sm font-semibold text-brand-700">Welcome back</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Sign in to LiveOrder</h2>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Sign in with the email and password you set for your seller account.</p>
      </div>
      {formError && <div className="mb-5"><Notice title={formError} /></div>}
      {currentCreator.isError && !(currentCreator.error instanceof ApiError && currentCreator.error.status === 401) && <div className="mb-5"><Notice title="We couldn't check your existing session. You can still try signing in." tone="info" /></div>}
      <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
        <TextField autoComplete="email" autoFocus label="Email" name="email" onChange={(event) => setEmail(event.currentTarget.value)} required type="email" value={email} />
        <TextField autoComplete="current-password" label="Password" name="password" onChange={(event) => setPassword(event.currentTarget.value)} required type="password" value={password} />
        <div className="-mt-2 text-right"><Link className="text-sm font-semibold text-brand-700 hover:text-brand-900" to="/forgot-password">Forgot password?</Link></div>
        <Button className="w-full" disabled={login.isPending} size="lg" type="submit">{login.isPending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <div className="mt-6 border-t border-border pt-5 text-sm leading-6 text-ink-muted">
        <p>New to LiveOrder? <Link className="font-semibold text-brand-700" to="/register">Create a seller account</Link>.</p>
        <p className="mt-2">Already have an access code? <Link className="font-semibold text-brand-700" to="/claim-account">Claim your existing account</Link>.</p>
      </div>
    </AuthFrame>
  );
}

export function AuthFrame({ eyebrow, headline, description, children }: { eyebrow: string; headline: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.8fr)]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-24 size-96 rounded-full border border-white/10" />
        <div className="absolute -right-4 top-16 size-72 rounded-full border border-white/10" />
        <div className="relative"><Brand inverse /></div>
        <div className="relative max-w-xl pb-12">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-200">{eyebrow}</p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-tight">{headline}</h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-white/75">{description}</p>
        </div>
        <p className="relative text-sm text-white/55">Built for independent sellers.</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <Card><CardContent className="p-6 sm:p-8">{children}</CardContent></Card>
        </div>
      </section>
    </main>
  );
}
