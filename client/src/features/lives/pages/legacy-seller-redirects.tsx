import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useStores } from "../hooks/use-lives";

export function LegacyLiveRouteRedirect() {
  const { liveId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const suffix = location.pathname.replace(/^\/lives\/[^/]+/, "");
    void navigate(`/stores/${encodeURIComponent(liveId)}${suffix}`, { replace: true });
  }, [liveId, location.pathname, navigate]);
  return null;
}

export function LegacyPaymentRouteRedirect() {
  const stores = useStores();
  const navigate = useNavigate();
  useEffect(() => {
    if (!stores.isSuccess) return;
    void navigate(stores.data[0] ? `/stores/${encodeURIComponent(stores.data[0].id)}/settings/payments` : "/stores", { replace: true });
  }, [navigate, stores.data, stores.isSuccess]);
  return null;
}
