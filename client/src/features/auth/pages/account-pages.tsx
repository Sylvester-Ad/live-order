import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { Button } from "../../../components/ui/button";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { storesApi } from "../../lives/api/lives-api";
import { AuthFrame } from "./login-page";
import { useClaimSeller, useRegisterSeller, useRequestPasswordReset, useResetSellerPassword, useVerifySellerEmail } from "../hooks/use-auth";

const genericError = "We couldn't complete that request. Check the details and try again.";
const genericEmailMessage = "If the details can be used, an email with next steps will be sent.";

function AuthFormNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const title = error instanceof ApiError && error.status === 429
    ? "Too many attempts. Wait a little while and try again."
    : error instanceof ApiError && error.status === 503
      ? "Email delivery is temporarily unavailable. Please try again later."
      : genericError;
  return <div className="mb-5"><Notice title={title} /></div>;
}

export function RegisterPage() {
  const register = useRegisterSeller();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate({ name, email, password }, { onSuccess: () => setSubmitted(true) });
  }
  return <AuthFrame eyebrow="Start selling online" headline="Create a Store and share it with customers." description="Your account gives you one place to manage your Stores, products, and orders.">
    <Heading title="Create a seller account" description="Use an email address you can open to verify your account." />
    {submitted ? <Notice title="Check your email for a verification link." tone="success"><span>{genericEmailMessage} After verifying, you can create your first Store.</span></Notice> : <>
      <AuthFormNotice error={register.error} />
      <form className="grid gap-5" onSubmit={submit}>
        <TextField autoComplete="name" label="Your name" maxLength={100} onChange={(event) => setName(event.currentTarget.value)} required value={name} />
        <TextField autoComplete="email" label="Email" onChange={(event) => setEmail(event.currentTarget.value)} required type="email" value={email} />
        <TextField autoComplete="new-password" hint="At least 12 characters with uppercase, lowercase, and a number." label="Password" minLength={12} onChange={(event) => setPassword(event.currentTarget.value)} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" required type="password" value={password} />
        <Button disabled={register.isPending} type="submit">{register.isPending ? "Sending…" : "Create account"}</Button>
      </form>
    </>}
    <AuthFooter>Already have an account? <Link className="font-semibold text-brand-700" to="/login">Sign in</Link>. Have an access code? <Link className="font-semibold text-brand-700" to="/claim-account">Claim it</Link>.</AuthFooter>
  </AuthFrame>;
}

export function ClaimAccountPage() {
  const claim = useClaimSeller();
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    claim.mutate({ accessCode, email, password }, { onSuccess: () => setSubmitted(true) });
  }
  return <AuthFrame eyebrow="Existing seller" headline="Keep your Store and order history." description="Claim the seller account connected to your access code. Your existing Stores and orders stay with the same account.">
    <Heading title="Claim your seller account" description="Your access code stays active until you verify the email address." />
    {submitted ? <Notice title="Check your email for a verification link." tone="success"><span>{genericEmailMessage} Your existing account is updated after verification.</span></Notice> : <>
      <AuthFormNotice error={claim.error} />
      <form className="grid gap-5" onSubmit={submit}>
        <TextField autoComplete="off" label="Existing access code" onChange={(event) => setAccessCode(event.currentTarget.value)} required type="password" value={accessCode} />
        <TextField autoComplete="email" label="Email" onChange={(event) => setEmail(event.currentTarget.value)} required type="email" value={email} />
        <TextField autoComplete="new-password" hint="At least 12 characters with uppercase, lowercase, and a number." label="New password" minLength={12} onChange={(event) => setPassword(event.currentTarget.value)} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" required type="password" value={password} />
        <Button disabled={claim.isPending} type="submit">{claim.isPending ? "Sending…" : "Send verification email"}</Button>
      </form>
    </>}
    <AuthFooter><Link className="font-semibold text-brand-700" to="/login">Back to sign in</Link></AuthFooter>
  </AuthFrame>;
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const verify = useVerifySellerEmail();
  const verifyEmail = verify.mutateAsync;
  const started = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const token = searchParams.get("token") ?? "";
  useEffect(() => {
    if (!token) return;
    if (started.current) return;
    started.current = true;
    let active = true;
    void verifyEmail(token).then(async () => {
      let destination = "/dashboard";
      try {
        const stores = await storesApi.list();
        destination = stores.length === 0 ? "/stores/new" : "/dashboard";
      } catch {
        // Email is already verified and the session cookie is set. The seller
        // can retry loading their Stores from the workspace if this read fails.
      }
      if (active) await navigate(destination, { replace: true });
    }).catch(() => { if (active) setErrorMessage("This verification link is invalid or expired. Request a new link or claim your account again."); });
    return () => { active = false; };
  }, [navigate, token, verifyEmail]);
  const visibleError = errorMessage ?? (!token ? "This verification link is missing its token. Request a new link or claim your account again." : undefined);
  return <AuthFrame eyebrow="Email verification" headline="Almost ready to manage your Store." description="We verify seller email addresses to help protect access to Stores and customer orders.">
    <Heading title="Verify your email" description="This page will finish verification and sign you in." />
    {visibleError ? <Notice title={visibleError} /> : <div className="py-4 text-sm text-ink-muted" role="status">Verifying your email…</div>}
    {visibleError && <AuthFooter><Link className="font-semibold text-brand-700" to="/claim-account">Try account claim again</Link></AuthFooter>}
  </AuthFrame>;
}

export function ForgotPasswordPage() {
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestReset.mutate(email, { onSuccess: () => setSubmitted(true) });
  }
  return <AuthFrame eyebrow="Account recovery" headline="Get back to your seller workspace." description="We'll send password recovery instructions if the address can be used for a verified seller account.">
    <Heading title="Forgot your password?" description="Enter the email address on your seller account." />
    {submitted ? <Notice title="Check your email for next steps." tone="success"><span>{genericEmailMessage}</span></Notice> : <>
      <AuthFormNotice error={requestReset.error} />
      <form className="grid gap-5" onSubmit={submit}>
        <TextField autoComplete="email" label="Email" onChange={(event) => setEmail(event.currentTarget.value)} required type="email" value={email} />
        <Button disabled={requestReset.isPending} type="submit">{requestReset.isPending ? "Sending…" : "Send recovery link"}</Button>
      </form>
    </>}
    <AuthFooter><Link className="font-semibold text-brand-700" to="/login">Back to sign in</Link></AuthFooter>
  </AuthFrame>;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reset = useResetSellerPassword();
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const token = searchParams.get("token") ?? "";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset.mutate({ token, password }, { onSuccess: () => setSubmitted(true) });
  }
  return <AuthFrame eyebrow="Account recovery" headline="Choose a new password." description="Saving a new password signs out your existing seller sessions.">
    <Heading title="Reset your password" description="Use at least 12 characters with uppercase, lowercase, and a number." />
    {submitted ? <>
      <Notice title="Your password has been updated." tone="success" />
      <div className="mt-5"><Button onClick={() => void navigate("/login", { replace: true })}>Return to sign in</Button></div>
    </> : <>
      <AuthFormNotice error={reset.error} />
      {!token && <div className="mb-5"><Notice title="This recovery link is missing its token. Request a new link." /></div>}
      <form className="grid gap-5" onSubmit={submit}>
        <TextField autoComplete="new-password" label="New password" minLength={12} onChange={(event) => setPassword(event.currentTarget.value)} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" required type="password" value={password} />
        <Button disabled={reset.isPending || !token} type="submit">{reset.isPending ? "Updating…" : "Update password"}</Button>
      </form>
    </>}
    <AuthFooter><Link className="font-semibold text-brand-700" to="/login">Back to sign in</Link></AuthFooter>
  </AuthFrame>;
}

function Heading({ title, description }: { title: string; description: string }) {
  return <div className="mb-8"><p className="text-sm font-semibold text-brand-700">LiveOrder seller account</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h2><p className="mt-3 text-sm leading-6 text-ink-muted">{description}</p></div>;
}

function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 border-t border-border pt-5 text-sm leading-6 text-ink-muted">{children}</div>;
}
