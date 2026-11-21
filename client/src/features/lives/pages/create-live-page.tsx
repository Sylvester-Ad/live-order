import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { useCreateStore } from "../hooks/use-lives";

export function CreateStorePage() {
  const navigate = useNavigate();
  const createStore = useCreateStore();
  const [name, setName] = useState("");
  const [tiktokLiveUrl, setTiktokLiveUrl] = useState("");
  const [validationError, setValidationError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return setValidationError("Enter a name for this Store.");
    if (trimmedName.length > 100) return setValidationError("Store names can be up to 100 characters.");
    setValidationError(undefined);
    createStore.mutate(
      { name: trimmedName, ...(tiktokLiveUrl.trim() ? { tiktokLiveUrl: tiktokLiveUrl.trim() } : {}) },
      { onSuccess: (store) => navigate(`/stores/${encodeURIComponent(store.id)}`, { state: { created: true } }) },
    );
  }

  const requestError = createStore.error instanceof ApiError && createStore.error.status === 400
    ? "Check the Store name and optional TikTok LIVE link."
    : "We couldn't create this Store. Check your connection and try again.";

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to="/stores">← All Stores</Link>
      <PageHeader description="Choose a name customers will recognize. You can add products and publish the Store when it is ready." eyebrow="New Store" title="Create a Store" />
      <form className="grid max-w-xl gap-5" noValidate onSubmit={handleSubmit}>
        {createStore.isError && <Notice title={requestError} />}
        <TextField
          autoFocus
          error={validationError}
          hint="Maximum 100 characters."
          label="Store name"
          maxLength={100}
          name="name"
          onChange={(event) => { setName(event.currentTarget.value); if (validationError) setValidationError(undefined); }}
          placeholder="For example, Ama's Kitchen"
          required
          value={name}
        />
        <TextField
          autoComplete="url"
          error={createStore.isError && createStore.error instanceof ApiError && createStore.error.status === 400 ? "Use an HTTPS URL from a supported TikTok domain." : undefined}
          hint="Optional legacy broadcast link. It does not affect your Store URL."
          label="TikTok LIVE URL (optional)"
          onChange={(event) => setTiktokLiveUrl(event.currentTarget.value)}
          placeholder="https://www.tiktok.com/@yourname/live"
          type="url"
          value={tiktokLiveUrl}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" to="/stores">Cancel</Link>
          <Button disabled={createStore.isPending} type="submit">{createStore.isPending ? "Creating Store…" : "Create Store"}</Button>
        </div>
      </form>
    </>
  );
}
