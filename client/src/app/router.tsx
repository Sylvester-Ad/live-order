import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from "react-router-dom";

import { AppShell } from "./AppShell";
import { NotFoundPage } from "./NotFoundPage";

export const routeConfig: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
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
