import { useState } from "react";

type Props = {
  productName: string;
  imageUrl: string | null;
  size?: "small" | "large";
};

export function OrderProductThumbnail({ productName, imageUrl, size = "small" }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const sizeClass = size === "large" ? "size-16" : "size-10";
  const description = `${productName} product image`;

  if (!imageUrl || failedUrl === imageUrl) {
    return (
      <span
        aria-label={`${productName} image unavailable`}
        className={`grid ${sizeClass} shrink-0 place-items-center rounded-control border border-border bg-canvas text-center text-[9px] leading-tight text-ink-muted`}
        role="img"
      >
        No image
      </span>
    );
  }

  return (
    <img
      alt={description}
      className={`${sizeClass} shrink-0 rounded-control border border-border bg-canvas object-cover`}
      onError={() => setFailedUrl(imageUrl)}
      src={imageUrl}
      title={productName}
    />
  );
}
