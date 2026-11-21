import { useState } from "react";
import { Link } from "react-router-dom";

import { Notice } from "../../../components/feedback/feedback";
import { Card, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { buttonClassName } from "../../../components/ui/button-styles";
import type { Store } from "../api/lives-api";
import { StoreStatusBadge } from "./live-status-badge";

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(date);
}

export function StoreCard({ store }: { store: Store }) {
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const storefrontUrl = `${window.location.origin}/live/${store.slug}`;

  async function copyStorefrontLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(storefrontUrl);
      setClipboardNotice("Storefront link copied.");
    } catch {
      setClipboardNotice("Couldn't copy the storefront link. Select and copy the URL from the Store workspace.");
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink">{store.name}</h2>
            <StoreStatusBadge status={store.status} />
          </div>
          <p className="text-sm text-ink-muted">/{store.slug} · Created {formatDate(store.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonClassName("primary", "sm")} to={`/stores/${encodeURIComponent(store.id)}`}>Manage Store</Link>
          <Link className={buttonClassName("secondary", "sm")} to={`/stores/${encodeURIComponent(store.id)}/orders`}>Manage orders</Link>
          {store.status === "PUBLISHED" && (
            <>
              <a className={buttonClassName("secondary", "sm")} href={storefrontUrl} rel="noopener noreferrer" target="_blank">Open storefront</a>
              <Button onClick={() => void copyStorefrontLink()} size="sm" type="button" variant="secondary">Copy storefront link</Button>
            </>
          )}
          {store.tiktokLiveUrl && (
            <a className={buttonClassName("ghost", "sm")} href={store.tiktokLiveUrl} rel="noopener noreferrer" target="_blank">Open TikTok LIVE</a>
          )}
        </div>
        {clipboardNotice && <Notice title={clipboardNotice} tone={clipboardNotice.startsWith("Storefront link copied") ? "success" : "error"} />}
      </CardContent>
    </Card>
  );
}
