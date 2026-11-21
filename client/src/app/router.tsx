import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";

import { CustomerLayout } from "../components/layout/customer-layout";
import { SellerLayout } from "../components/layout/seller-layout";
import { RequireCreator } from "../features/auth/components/require-creator";
import { LoginPage } from "../features/auth/pages/login-page";
import { DashboardPage } from "../features/dashboard/pages/dashboard-page";
import { CreateStorePage } from "../features/lives/pages/create-live-page";
import { StoresPage } from "../features/lives/pages/lives-page";
import { StoreWorkspacePage } from "../features/lives/pages/live-workspace-page";
import { ProductsPage } from "../features/products/pages/products-page";
import { ProductFormPage } from "../features/products/pages/product-form-page";
import { PublicLivePage } from "../features/public-live/pages/public-live-page";
import { OrdersPage } from "../features/orders/pages/orders-page";
import { MobileMoneySettingsPage } from "../features/payments/pages/mobile-money-settings-page";
import { NotFoundPage } from "./NotFoundPage";
import { LegacyLiveRouteRedirect, LegacyPaymentRouteRedirect } from "../features/lives/pages/legacy-seller-redirects";

export const routeConfig: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/live/:slug",
    element: <CustomerLayout />,
    children: [{ index: true, element: <PublicLivePage /> }],
  },
  {
    element: <RequireCreator />,
    children: [
      {
        element: <SellerLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "stores", element: <StoresPage /> },
          { path: "stores/new", element: <CreateStorePage /> },
          { path: "stores/:storeId", element: <StoreWorkspacePage /> },
          { path: "stores/:storeId/products", element: <ProductsPage /> },
          { path: "stores/:storeId/products/new", element: <ProductFormPage /> },
          { path: "stores/:storeId/products/:productId/images", element: <ProductFormPage /> },
          { path: "stores/:storeId/products/:productId/edit", element: <ProductFormPage /> },
          { path: "stores/:storeId/settings/payments", element: <MobileMoneySettingsPage /> },
          { path: "lives", element: <Navigate to="/stores" replace /> },
          { path: "lives/new", element: <Navigate to="/stores/new" replace /> },
          { path: "lives/:liveId", element: <LegacyLiveRouteRedirect /> },
          { path: "lives/:liveId/*", element: <LegacyLiveRouteRedirect /> },
          { path: "settings/payments", element: <LegacyPaymentRouteRedirect /> },
          {
            path: "stores/:storeId/orders",
            element: <OrdersPage />,
          },
          {
            path: "stores/:storeId/orders/:orderId",
            element: <OrdersPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
];

export const appRouter = createBrowserRouter(routeConfig);

export function createTestRouter(initialEntries: string[] = ["/"]) {
  return createMemoryRouter(routeConfig, { initialEntries });
}
