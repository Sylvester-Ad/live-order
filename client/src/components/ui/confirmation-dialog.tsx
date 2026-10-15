import { useEffect, useId, useRef, type SyntheticEvent, type ReactNode } from "react";

import { Button } from "./button";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  isPending?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  isPending = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `confirmation-${useId()}`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!isPending) onCancel();
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="w-[min(100%-2rem,32rem)] rounded-panel border border-border bg-surface p-0 text-ink shadow-[0_24px_80px_rgb(15_37_31_/_28%)] backdrop:bg-ink/45"
      onCancel={handleCancel}
      role="alertdialog"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
      ref={dialogRef}
    >
      <div className="p-6 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight" id={titleId}>{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted" id={descriptionId}>{description}</p>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-7 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button disabled={isPending} onClick={onCancel} type="button" variant="secondary">
            {cancelLabel}
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button" variant="danger">
            {isPending ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
