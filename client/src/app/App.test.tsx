import { render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppProviders } from "./providers";
import { createTestRouter } from "./router";

describe("application shell", () => {
  it("renders the root route shell", () => {
    render(
      <AppProviders>
        <RouterProvider router={createTestRouter(["/"])} />
      </AppProviders>,
    );

    expect(
      screen.getByRole("heading", { name: /frontend foundation ready/i }),
    ).toBeInTheDocument();
  });

  it("renders the not found route", () => {
    render(
      <AppProviders>
        <RouterProvider router={createTestRouter(["/does-not-exist"])} />
      </AppProviders>,
    );

    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
  });
});
