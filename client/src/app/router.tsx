import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from "react-router-dom";

import { CustomerLayout } from "../components/layout/customer-layout";
import { SellerLayout } from "../components/layout/seller-layout";
import { RequireCreator } from "../features/auth/components/require-creator";
import { LoginPage } from "../features/auth/pages/login-page";
import { DashboardPage } from "../features/dashboard/pages/dashboard-page";
import { CreateLivePage } from "../features/lives/pages/create-live-page";
import { LiveSectionPlaceholder } from "../features/lives/pages/live-section-placeholder";
import { LivesPage } from "../features/lives/pages/lives-page";
import { LiveWorkspacePage } from "../features/lives/pages/live-workspace-page";
import { ProductsPage } from "../features/products/pages/products-page";
import { ProductFormPage } from "../features/products/pages/product-form-page";
import { PublicLivePage } from "../features/public-live/pages/public-live-page";
import { NotFoundPage } from "./NotFoundPage";

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
          { path: "lives", element: <LivesPage /> },
          { path: "lives/new", element: <CreateLivePage /> },
          { path: "lives/:liveId", element: <LiveWorkspacePage /> },
          { path: "lives/:liveId/products", element: <ProductsPage /> },
          { path: "lives/:liveId/products/new", element: <ProductFormPage /> },
          { path: "lives/:liveId/products/:productId/edit", element: <ProductFormPage /> },
          {
            path: "lives/:liveId/orders",
            element: <LiveSectionPlaceholder section="Orders" />,
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
