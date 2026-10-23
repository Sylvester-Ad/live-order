import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { StatusBadge } from "../../../components/ui/status-badge";
import { buttonClassName } from "../../../components/ui/button-styles";
import { formatPesewas } from "../../../lib/format-money";
import { useLives } from "../../lives/hooks/use-lives";
import { useExportOrdersCsv, useMarkOrderPaid, useSellerOrders } from "../hooks/use-seller-orders";
import { OrderDetails } from "../components/order-details";
import { OrderPaymentAction } from "../components/order-payment-action";

function formatOrderDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "live";
}

export function OrdersPage() {
  const { liveId = "", orderId } = useParams();
  const lives = useLives({ refetchOnMount: "always" });
  const orders = useSellerOrders(liveId);
  const markPaid = useMarkOrderPaid(liveId);
  const exportOrders = useExportOrdersCsv();
  const [paidNotice, setPaidNotice] = useState(false);
  const [exportError, setExportError] = useState(false);

  if (lives.isPending) return <LoadingState label="Loading Live details…" />;
  if (lives.isError && !lives.data) return <RequestFailure label="We couldn't load the selected Live." onRetry={() => void lives.refetch()} />;
  if (!lives.data) return <LoadingState label="Loading Live details…" />;
  const live = lives.data.find((item) => item.id === liveId);
  if (!live) return <EmptyState description="This Live may have been removed or may not belong to your account." title="Live not found" action={<Link className={buttonClassName("secondary")} to="/lives">All Lives</Link>} />;
  const selectedLive = live;

  if (orders.isPending) return <LoadingState label="Loading orders…" />;
  if (orders.isError && !orders.data) return <RequestFailure label="We couldn't load orders for this Live." onRetry={() => void orders.refetch()} />;
  const orderList = orders.data ?? [];
  const selectedOrder = orderId ? orderList.find((order) => order.id === orderId) : undefined;

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilenamePart(selectedLive.name)}-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setExportError(false);
    try {
      const blob = await exportOrders.mutateAsync(liveId);
      download(blob);
    } catch {
      setExportError(true);
    }
  }

  if (orderId) {
    if (!selectedOrder) {
      return <EmptyState title="Order not found" description="This order is not part of the selected Live, or it is no longer available." action={<Link className={buttonClassName("secondary")} to={`/lives/${liveId}/orders`}>Back to orders</Link>} />;
    }
    return (
      <>
        {orders.isError && <div className="mb-4"><RequestFailure label="Orders could not be refreshed. Showing the last confirmed information." onRetry={() => void orders.refetch()} /></div>}
        {paidNotice && <div className="mb-4"><Notice title="Order marked as paid." tone="success" /></div>}
        <OrderDetails
          live={selectedLive}
          order={selectedOrder}
          onBack={`/lives/${liveId}/orders`}
          paymentAction={selectedOrder.paymentStatus === "PENDING" ? <OrderPaymentAction orderId={selectedOrder.id} onMarkPaid={(id) => markPaid.mutateAsync(id)} onSuccess={() => setPaidNotice(true)} pending={markPaid.isPending} /> : undefined}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <Link className={buttonClassName("ghost", "sm")} to={`/lives/${liveId}`}>← Live management</Link>
        <Link className={buttonClassName("ghost", "sm")} to="/">Dashboard</Link>
      </div>
      <PageHeader
        description={`Orders placed for ${selectedLive.name}. Payment is confirmed manually by you.`}
        eyebrow="Live workspace"
        title="Orders"
        action={<Button disabled={exportOrders.isPending} onClick={() => void handleExport()} type="button" variant="secondary">{exportOrders.isPending ? "Preparing export…" : "Export CSV"}</Button>}
      />
      {exportError && <div className="mb-4"><Notice title="The order export could not be downloaded. Please try again." /></div>}
      {orders.isError && <div className="mb-4"><RequestFailure label="Orders could not be refreshed. Showing the last confirmed information." onRetry={() => void orders.refetch()} /></div>}
      {paidNotice && <div className="mb-4"><Notice title="Order marked as paid." tone="success" /></div>}

      {orderList.length === 0 ? (
        <EmptyState title="No orders yet" description="Customer orders for this Live will appear here." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-panel border border-border bg-white md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-muted"><tr>
                  <th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody className="divide-y divide-border">{orderList.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-4 font-mono font-semibold text-ink">{order.reference}</td>
                    <td className="px-4 py-4 text-ink">{order.customerName}</td>
                    <td className="px-4 py-4 text-ink-muted">{formatOrderDate(order.createdAt)}</td>
                    <td className="px-4 py-4 text-ink-muted">{order.items.length} {order.items.length === 1 ? "line" : "lines"}</td>
                    <td className="px-4 py-4 font-semibold tabular-nums text-ink">{formatPesewas(order.totalAmount)}</td>
                    <td className="px-4 py-4"><StatusBadge tone={order.paymentStatus === "PAID" ? "paid" : "pending"}>{order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</StatusBadge></td>
                    <td className="px-4 py-4"><div className="flex justify-end gap-2"><Link className={buttonClassName("secondary", "sm")} to={`/lives/${liveId}/orders/${order.id}`}>View order</Link>{order.paymentStatus === "PENDING" && <OrderPaymentAction orderId={order.id} onMarkPaid={(id) => markPaid.mutateAsync(id)} onSuccess={() => setPaidNotice(true)} pending={markPaid.isPending} />}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <ul className="grid gap-3 md:hidden">{orderList.map((order) => (
            <li key={order.id}>
              <Card><CardContent className="grid gap-3">
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono font-bold text-ink">{order.reference}</p><p className="text-sm text-ink-muted">{order.customerName}</p></div><StatusBadge tone={order.paymentStatus === "PAID" ? "paid" : "pending"}>{order.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</StatusBadge></div>
                <div className="flex justify-between gap-3 text-sm"><span className="text-ink-muted">{formatOrderDate(order.createdAt)} · {order.items.length} {order.items.length === 1 ? "line" : "lines"}</span><span className="font-bold tabular-nums text-ink">{formatPesewas(order.totalAmount)}</span></div>
                <div className="flex flex-wrap gap-2"><Link className={buttonClassName("secondary", "sm")} to={`/lives/${liveId}/orders/${order.id}`}>View order</Link>{order.paymentStatus === "PENDING" && <OrderPaymentAction orderId={order.id} onMarkPaid={(id) => markPaid.mutateAsync(id)} onSuccess={() => setPaidNotice(true)} pending={markPaid.isPending} />}</div>
              </CardContent></Card>
            </li>
          ))}</ul>
        </>
      )}
    </>
  );
}
