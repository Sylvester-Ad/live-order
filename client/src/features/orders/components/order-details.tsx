import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { PageHeader } from "../../../components/layout/page-header";
import { Card, CardContent } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { buttonClassName } from "../../../components/ui/button-styles";
import { formatPesewas } from "../../../lib/format-money";
import type { Live } from "../../lives/api/lives-api";
import type { SellerOrder } from "../api/seller-orders-api";

function dateLabel(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(date);
}

function optionLabels(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
}

export function OrderDetails({ live, order, onBack, paymentAction }: { live: Live; order: SellerOrder; onBack: string; paymentAction?: ReactNode }) {
  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={onBack}>← All orders</Link>
      <PageHeader
        description={`Placed ${dateLabel(order.createdAt)} for ${live.name}.`}
        eyebrow="Order details"
        title={order.reference}
        action={<StatusBadge tone={order.paymentStatus === "PAID" ? "paid" : "pending"}>{order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</StatusBadge>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card><CardContent>
          <h2 className="text-lg font-bold text-ink">Items ordered</h2>
          {order.items.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No order lines are available.</p> : (
            <ul className="mt-4 divide-y divide-border border-y border-border">{order.items.map((item) => (
              <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" key={item.id}>
                <div>
                  <p className="font-semibold text-ink">{item.productName}</p>
                  {optionLabels(item.selectedOptions).length > 0 && <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-muted">{optionLabels(item.selectedOptions).map(([name, selected]) => <li key={name}>{name}: {selected}</li>)}</ul>}
                  <p className="mt-1 text-sm text-ink-muted">Quantity {item.quantity} · {formatPesewas(item.unitPrice)} each</p>
                </div>
                <p className="font-semibold tabular-nums text-ink">{formatPesewas(item.unitPrice * item.quantity)}</p>
              </li>
            ))}</ul>
          )}
          <p className="mt-4 flex justify-between text-lg font-bold text-ink"><span>Persisted order total</span><span className="tabular-nums">{formatPesewas(order.totalAmount)}</span></p>
        </CardContent></Card>
        <Card><CardContent className="grid content-start gap-4">
          <h2 className="text-lg font-bold text-ink">Customer</h2>
          <Detail label="Name" value={order.customerName} />
          <Detail label="Phone" value={order.customerPhone} />
          <Detail label="Delivery location" value={order.deliveryLocation} />
          <div className="border-t border-border pt-4"><p className="text-sm font-semibold text-ink">Payment status</p><p className="mt-2"><StatusBadge tone={order.paymentStatus === "PAID" ? "paid" : "pending"}>{order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</StatusBadge></p>{order.paymentStatus === "PENDING" && <p className="mt-2 text-xs leading-5 text-ink-muted">Payment is confirmed manually after you verify receipt.</p>}</div>
          {paymentAction}
          <Link className={buttonClassName("secondary")} to={onBack}>Back to orders</Link>
        </CardContent></Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-1 break-words text-sm text-ink">{value || "Not available"}</p></div>;
}
