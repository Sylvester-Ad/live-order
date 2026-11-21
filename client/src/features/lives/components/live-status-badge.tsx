import { StatusBadge } from "../../../components/ui/status-badge";
import type { Store } from "../api/lives-api";

const statusTones: Record<Store["status"], "draft" | "active" | "ended"> = {
  DRAFT: "draft",
  PUBLISHED: "active",
  UNPUBLISHED: "ended",
};

const statusLabels: Record<Store["status"], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  UNPUBLISHED: "Unpublished",
};

export function StoreStatusBadge({ status }: { status: Store["status"] }) {
  return <StatusBadge tone={statusTones[status]}>{statusLabels[status]}</StatusBadge>;
}
