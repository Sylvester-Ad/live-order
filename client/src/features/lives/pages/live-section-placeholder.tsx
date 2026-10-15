import { Link, useParams } from "react-router-dom";

import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/feedback/feedback";

export function LiveSectionPlaceholder({ section }: { section: "Products" | "Orders" }) {
  const { liveId = "" } = useParams();

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/lives/${liveId}`}>
        ← Live workspace
      </Link>
      <PageHeader
        description={`${section} for this Live will be built as the next feature stage.`}
        eyebrow="Live workspace"
        title={section}
      />
      <EmptyState
        description="The authenticated route and feature boundary are ready. This screen will be connected to the real API in the next implementation stage."
        title={`${section} workspace is ready for implementation`}
      />
    </>
  );
}
