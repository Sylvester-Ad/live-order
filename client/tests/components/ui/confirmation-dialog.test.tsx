import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "../../../src/components/ui/confirmation-dialog";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

describe("ConfirmationDialog", () => {
  it("shows an accessible prompt and exposes explicit choices", () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        cancelLabel="Keep product"
        confirmLabel="Delete product"
        description="This action cannot be undone."
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
        title="Delete this product?"
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "Delete this product?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep product" }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
