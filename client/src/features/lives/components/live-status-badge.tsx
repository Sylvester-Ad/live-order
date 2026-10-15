import { StatusBadge } from "../../../components/ui/status-badge";
import type { Live } from "../api/lives-api";

const statusTones: Record<Live["status"], "draft" | "active" | "ended"> = {
  DRAFT: "draft",
  ACTIVE: "active",
  ENDED: "ended",
};

export function LiveStatusBadge({ status }: { status: Live["status"] }) {
  return <StatusBadge tone={statusTones[status]}>{status}</StatusBadge>;
}
