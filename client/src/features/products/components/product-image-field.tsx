import { useEffect, useRef, useState } from "react";

import { Button } from "../../../components/ui/button";

type Props = {
  productName: string;
  currentImageUrl?: string | null;
  file: File | null;
  onFileChange(file: File | null): void;
  disabled?: boolean;
  pending?: boolean;
  onUpload?: () => void;
  uploadLabel?: string;
  onRemove?: () => void;
  removePending?: boolean;
};

export function ProductImageField({
  productName,
  currentImageUrl,
  file,
  onFileChange,
  disabled = false,
  pending = false,
  onUpload,
  uploadLabel = currentImageUrl ? "Replace image" : "Upload image",
  onRemove,
  removePending = false,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function selectFile(nextFile: File | null) {
    setObjectUrl(nextFile ? URL.createObjectURL(nextFile) : null);
    onFileChange(nextFile);
  }

  const previewUrl = file ? objectUrl : currentImageUrl ?? null;

  const fileError = file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ? "Choose a JPEG, PNG, or WebP image."
    : file && file.size > 5 * 1024 * 1024
      ? "Product images must be 5 MB or smaller."
      : null;

  return (
    <section className="grid gap-3 border-t border-border pt-5" aria-labelledby="product-image-heading">
      <h2 className="text-base font-bold text-ink" id="product-image-heading">Product image</h2>
      <p className="text-sm text-ink-muted">JPEG, PNG, or WebP, up to 5 MB. Customers will see this image with the product.</p>
      {previewUrl ? (
        <img alt={`${productName} product preview`} className="max-h-64 w-full rounded-panel bg-canvas object-contain" src={previewUrl} />
      ) : (
        <div className="grid aspect-4/3 max-w-sm place-items-center rounded-panel bg-canvas text-sm text-ink-muted">No product image selected</div>
      )}
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose an image file"
        className="sr-only"
        disabled={disabled || pending || removePending}
        onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
        ref={fileInput}
        type="file"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={disabled || pending || removePending} onClick={() => fileInput.current?.click()} type="button" variant="secondary">
          {currentImageUrl ? "Choose a replacement image" : "Choose image"}
        </Button>
        {file ? <span className="min-w-0 break-all text-sm text-ink-muted">Selected: {file.name}</span> : null}
      </div>
      {fileError && <p className="text-sm text-danger-700" role="alert">{fileError}</p>}
      {file && <Button disabled={disabled || pending || removePending} onClick={() => {
        selectFile(null);
        if (fileInput.current) fileInput.current.value = "";
      }} size="sm" type="button" variant="secondary">Remove selected image</Button>}
      <div className="flex flex-wrap gap-2">
        {onUpload && (
          <Button disabled={!file || Boolean(fileError) || disabled || pending || removePending} onClick={onUpload} type="button">
            {pending ? "Uploading…" : uploadLabel}
          </Button>
        )}
        {currentImageUrl && onRemove && (
          <Button disabled={disabled || pending || removePending} onClick={onRemove} type="button" variant="danger">
            {removePending ? "Removing…" : "Remove image"}
          </Button>
        )}
      </div>
    </section>
  );
}
