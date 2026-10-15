import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { useCreateLive } from "../hooks/use-lives";

export function CreateLivePage() {
  const navigate = useNavigate();
  const createLive = useCreateLive();
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      setValidationError("Enter a name for this Live.");
      return;
    }
    if (trimmedName.length > 100) {
      setValidationError("Live names can be up to 100 characters.");
      return;
    }

    setValidationError(undefined);
    createLive.mutate(
      { name: trimmedName },
      { onSuccess: (live) => navigate(`/lives/${live.id}`, { state: { created: true } }) },
    );
  }

  const requestError = createLive.error instanceof ApiError && createLive.error.status === 400
    ? "Enter a valid Live name of 1 to 100 characters."
    : "We couldn't create this Live. Check your connection and try again.";

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to="/lives">
        ← All Lives
      </Link>
      <PageHeader
        description="Give this selling session a name. You can manage its products and orders from its workspace."
        eyebrow="New selling session"
        title="Create a Live"
      />
      <form className="grid max-w-xl gap-5" noValidate onSubmit={handleSubmit}>
        {createLive.isError && <Notice title={requestError} />}
        <TextField
          autoFocus
          error={validationError}
          hint="Use a name your team will recognize. Maximum 100 characters."
          label="Live name"
          maxLength={100}
          name="name"
          onChange={(event) => {
            setName(event.currentTarget.value);
            if (validationError) setValidationError(undefined);
          }}
          placeholder="For example, Friday fashion"
          required
          value={name}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" to="/lives">
            Cancel
          </Link>
          <Button disabled={createLive.isPending} type="submit">
            {createLive.isPending ? "Creating Live…" : "Create Live"}
          </Button>
        </div>
      </form>
    </>
  );
}
