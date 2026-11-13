import { useRef, useState } from "react";

import { Button } from "../../../components/ui/button";
import { getProductImageFileError } from "../lib/product-image-validation";

export type ProductImageUploadStatus = "selected" | "uploading" | "failed" | "succeeded";

export type ProductImageUploadItem = {
  id: string;
  file: File;
  idempotencyKey: string;
  status: ProductImageUploadStatus;
  errorMessage?: string;
  isRecovery?: boolean;
};

export type ProductImageRecoveryItem = {
  idempotencyKey: string;
  hasLocalAttempt: boolean;
  hasMatchingFile?: boolean;
};

type Props = {
  productName: string;
  currentImageUrl?: string | null;
  uploads: ProductImageUploadItem[];
  availableSlots: number;
  disabled?: boolean;
  preparing?: boolean;
  onFilesSelected(files: File[]): void;
  onUploadSelected(): void;
  onRetryUpload(uploadId: string): void;
  onRemoveSelected(uploadId: string): void;
  selectionMessage?: string | null;
  pendingUploads: ProductImageRecoveryItem[];
  pendingUploadsLoading?: boolean;
  pendingUploadsError?: string | null;
  recoveryStorageError?: string | null;
  selectionDisabled?: boolean;
};

export function ProductImageField({
  productName,
  currentImageUrl,
  uploads,
  availableSlots,
  disabled = false,
  preparing = false,
  onFilesSelected,
  onUploadSelected,
  onRetryUpload,
  onRemoveSelected,
  selectionMessage,
  pendingUploads,
  pendingUploadsLoading = false,
  pendingUploadsError = null,
  recoveryStorageError = null,
  selectionDisabled = false,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectionLimitMessage, setSelectionLimitMessage] = useState<string | null>(null);
  const eligibleUploads = uploads.filter((upload) =>
    (upload.status === "selected" || upload.status === "failed") && !getProductImageFileError(upload.file),
  );
  const eligibleNewUploads = eligibleUploads.filter((upload) => !upload.isRecovery);
  const hasImages = uploads.some((upload) => upload.status === "succeeded");

  function selectFiles(files: File[]) {
    setSelectionLimitMessage(null);
    if (files.length > availableSlots) {
      setSelectionLimitMessage(
        availableSlots === 0
          ? "This product has reached the three-image limit."
          : `Only ${availableSlots} image slot${availableSlots === 1 ? "" : "s"} available. The remaining selected images were not added.`,
      );
    }
    onFilesSelected(files.slice(0, availableSlots));
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section className="grid gap-3 border-t border-border pt-5" aria-labelledby="product-image-heading">
      <h2 className="text-base font-bold text-ink" id="product-image-heading">Add product images</h2>
      <p className="text-sm text-ink-muted">Choose up to three JPEG, PNG, or WebP images, up to 5 MB each.</p>
      {currentImageUrl && !hasImages && (
        <p className="text-sm text-ink-muted">The current primary image is shown in the gallery above.</p>
      )}
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Choose images for ${productName}`}
        className="sr-only"
        disabled={disabled || preparing || selectionDisabled || availableSlots === 0}
        multiple
        onChange={(event) => selectFiles(Array.from(event.currentTarget.files ?? []))}
        ref={fileInput}
        type="file"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || preparing || selectionDisabled || availableSlots === 0}
          onClick={() => fileInput.current?.click()}
          type="button"
          variant="secondary"
        >
          {preparing ? "Preparing images…" : "Choose images"}
        </Button>
        <span className="text-sm text-ink-muted">
          {availableSlots === 0 ? "No image slots available" : `${availableSlots} of 3 image slots available`}
        </span>
      </div>
      {availableSlots === 0 && (
        <p className="text-sm font-semibold text-ink-muted">This product has reached the three-image limit.</p>
      )}
      {(selectionLimitMessage || selectionMessage) && (
        <p className="text-sm text-status-warn-ink" role="status">{selectionMessage ?? selectionLimitMessage}</p>
      )}
      <section aria-labelledby="pending-image-recovery-heading" className="grid gap-2">
        <h3 className="text-sm font-bold text-ink" id="pending-image-recovery-heading">Interrupted uploads</h3>
        <p className="text-sm text-ink-muted">After a refresh, choose the exact original file again to safely retry it.</p>
        {pendingUploadsLoading && <p aria-live="polite" className="text-sm text-ink-muted">Checking for unfinished uploads…</p>}
        {pendingUploadsError && <p className="text-sm text-danger-700" role="alert">{pendingUploadsError}</p>}
        {recoveryStorageError && <p className="text-sm text-danger-700" role="alert">{recoveryStorageError}</p>}
        {!pendingUploadsLoading && !pendingUploadsError && pendingUploads.length === 0 && (
          <p className="text-sm text-ink-muted">No unfinished uploads.</p>
        )}
        {pendingUploads.length > 0 && (
          <ul aria-label="Unfinished image uploads" className="grid gap-2">
            {pendingUploads.map((pendingUpload) => (
              <li className="rounded-control border border-status-warn-border bg-status-warn-bg p-3" key={pendingUpload.idempotencyKey}>
                <p className="text-sm font-semibold text-status-warn-ink">
                  {pendingUpload.hasLocalAttempt
                    ? pendingUpload.hasMatchingFile
                      ? "Original file matched — retry it from the upload list below."
                      : "Upload unfinished — choose the original file to retry."
                    : "Upload unfinished — the original retry details are unavailable in this tab."}
                </p>
                {!pendingUpload.hasLocalAttempt && (
                  <p className="mt-1 text-sm text-ink-muted">
                    Do not choose a different file for this upload. You can continue with other files if image slots remain.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {uploads.length > 0 && (
        <ul aria-label="Image upload status" className="grid gap-2">
          {uploads.map((upload) => {
            const fileError = getProductImageFileError(upload.file);
            return (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3" key={upload.id}>
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-ink">{upload.file.name}</p>
                  {fileError ? (
                    <p className="text-sm text-danger-700" role="alert">{fileError}</p>
                  ) : upload.status === "uploading" ? (
                    <p aria-live="polite" className="text-sm text-ink-muted">Uploading…</p>
                  ) : upload.status === "succeeded" ? (
                    <p className="text-sm text-success-800">Uploaded</p>
                  ) : upload.status === "failed" ? (
                    <p className="text-sm text-danger-700" role="alert">{upload.errorMessage}</p>
                  ) : upload.isRecovery ? (
                    <p className="text-sm text-status-warn-ink">Original file matched; ready to retry</p>
                  ) : (
                    <p className="text-sm text-ink-muted">Ready to upload</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {upload.status === "failed" && !fileError && (
                    <Button disabled={disabled} onClick={() => onRetryUpload(upload.id)} size="sm" type="button">
                      {upload.isRecovery ? "Retry pending upload" : "Retry"}
                    </Button>
                  )}
                  {upload.isRecovery && upload.status === "selected" && !fileError && (
                    <Button disabled={disabled} onClick={() => onRetryUpload(upload.id)} size="sm" type="button">
                      Retry pending upload
                    </Button>
                  )}
                  {upload.status !== "uploading" && upload.status !== "succeeded" && (
                    <Button disabled={disabled} onClick={() => onRemoveSelected(upload.id)} size="sm" type="button" variant="secondary">
                      Remove from list
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {eligibleNewUploads.length > 0 && (
        <Button disabled={disabled} onClick={onUploadSelected} type="button">
          Upload selected images ({eligibleNewUploads.length})
        </Button>
      )}
    </section>
  );
}
