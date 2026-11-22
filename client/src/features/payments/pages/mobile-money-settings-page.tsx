import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TextField } from "../../../components/ui/text-field";
import type { MobileMoneyProvider, MobileMoneySettings } from "../api/mobile-money-api";
import { useMobileMoneySettings, useSaveMobileMoneySettings } from "../hooks/use-mobile-money-settings";
import { useStores } from "../../lives/hooks/use-lives";

const providers: { value: MobileMoneyProvider; label: string }[] = [
  { value: "MTN_MOBILE_MONEY", label: "MTN Mobile Money" },
  { value: "TELECEL_CASH", label: "Telecel Cash" },
  { value: "AT_MONEY", label: "AT Money" },
];

export function MobileMoneySettingsPage() {
  const { storeId = "" } = useParams();
  const stores = useStores();
  const settings = useMobileMoneySettings(storeId);

  if (stores.isPending || settings.isPending) return <LoadingState label="Loading Store payment settings…" />;
  if (stores.isError) return <RequestFailure label="We couldn't load your Stores." onRetry={() => void stores.refetch()} />;
  if (settings.isError) return <RequestFailure label="We couldn't load this Store's Mobile Money settings." onRetry={() => void settings.refetch()} />;
  const store = stores.data.find((item) => item.id === storeId);
  if (!store) return <EmptyState title="Store not found" description="This Store may no longer belong to your account." action={<Link className="font-semibold text-brand-700 underline" to="/stores">All Stores</Link>} />;

  return <>
    <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/stores/${encodeURIComponent(store.id)}`}>← {store.name}</Link>
    <PageHeader description={`Payment instructions are configured independently for ${store.name}. New orders will use this Store's enabled settings.`} eyebrow="Store settings" title="Mobile Money" />
    {!settings.data && <div className="mb-5"><Notice title="No Mobile Money settings are configured for this Store yet. Add details below to show payment instructions on new orders." /></div>}
    <MobileMoneySettingsForm key={store.id} storeId={store.id} initialSettings={settings.data} />
  </>;
}

function MobileMoneySettingsForm({ storeId, initialSettings }: { storeId: string; initialSettings: MobileMoneySettings | null }) {
  const saveSettings = useSaveMobileMoneySettings(storeId);
  const [provider, setProvider] = useState<MobileMoneyProvider>(initialSettings?.provider ?? "MTN_MOBILE_MONEY");
  const [accountName, setAccountName] = useState(initialSettings?.accountName ?? "");
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState(initialSettings?.mobileMoneyNumber ?? "");
  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? true);
  const [savedNotice, setSavedNotice] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedNotice(false);
    setFormError(null);
    try {
      await saveSettings.mutateAsync({ provider, accountName, mobileMoneyNumber, enabled });
      setSavedNotice(true);
    } catch {
      setFormError("We couldn't save this Store's payment details. Check the number and try again.");
    }
  }

  return <Card><CardContent>
    <form className="grid max-w-xl gap-5" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="mobile-money-provider">Provider</label>
        <select className="min-h-12 w-full rounded-control border border-border bg-white px-3.5 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1" id="mobile-money-provider" onChange={(event) => { const selectedProvider = providers.find((item) => item.value === event.target.value); if (selectedProvider) setProvider(selectedProvider.value); }} required value={provider}>
          {providers.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <TextField autoComplete="name" label="Account name" maxLength={100} onChange={(event) => setAccountName(event.currentTarget.value)} placeholder="Name registered to the account" required value={accountName} />
      <TextField autoComplete="tel" hint="Use a Ghanaian number such as 024 123 4567 or +233 24 123 4567." inputMode="tel" label="Mobile Money number" onChange={(event) => setMobileMoneyNumber(event.currentTarget.value)} placeholder="024 123 4567" required type="tel" value={mobileMoneyNumber} />
      <label className="flex items-start gap-3 rounded-control border border-border p-4">
        <input checked={enabled} className="mt-1 size-4 accent-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700" onChange={(event) => setEnabled(event.currentTarget.checked)} type="checkbox" />
        <span><span className="block text-sm font-semibold text-ink">Show Mobile Money instructions to customers</span><span className="mt-1 block text-sm leading-5 text-ink-muted">Turning this off keeps the details saved but leaves them off new order confirmations.</span></span>
      </label>
      {formError && <Notice title={formError} />}
      {savedNotice && <Notice title="Store Mobile Money settings saved." tone="success" />}
      <div><Button disabled={saveSettings.isPending} type="submit">{saveSettings.isPending ? "Saving…" : "Save payment settings"}</Button></div>
    </form>
  </CardContent></Card>;
}
