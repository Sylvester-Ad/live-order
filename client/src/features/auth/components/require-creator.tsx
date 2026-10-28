import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { ApiError } from "../../../lib/api-client";
import { useCurrentCreator } from "../hooks/use-auth";

export function RequireCreator() {
  const location = useLocation();
  const creator = useCurrentCreator();

  if (creator.isPending) {
    return <LoadingState label="Restoring your seller session…" />;
  }

  if (creator.error instanceof ApiError && creator.error.status === 401) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (creator.isError) {
    return <RequestFailure label="We couldn't verify your session." onRetry={() => void creator.refetch()} />;
  }

  return <Outlet />;
}
