import { useState } from "react";

import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { Button } from "../../../components/ui/button";
import { Notice } from "../../../components/feedback/feedback";

export function OrderPaymentAction({
  orderId,
  pending,
  onMarkPaid,
  onSuccess,
}: {
  orderId: string;
  pending: boolean;
  onMarkPaid(orderId: string): Promise<unknown>;
  onSuccess(): void;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    if (pending) return;
    setFailed(false);
    try {
      await onMarkPaid(orderId);
      setOpen(false);
      onSuccess();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <Button disabled={pending} onClick={() => { setFailed(false); setOpen(true); }} size="sm" type="button" variant="secondary">Mark paid</Button>
      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Mark as paid"
        description="Only confirm this after you have manually verified that payment was received. LiveOrder does not verify Mobile Money payments."
        isPending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirm()}
        open={open}
        title="Confirm payment received?"
      >
        {failed && <Notice title="We couldn't update payment status. Check the order and try again." />}
      </ConfirmationDialog>
    </>
  );
}
