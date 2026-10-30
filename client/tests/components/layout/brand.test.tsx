import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Brand } from "../../../src/components/layout/brand";

describe("Brand", () => {
  it("renders the wordmark with the locally stored mark", () => {
    const { container } = render(<MemoryRouter><Brand /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "LiveOrder home" })).toBeInTheDocument();
    expect(screen.getByText("LiveOrder")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "/liveorder-mark.svg");
  });

  it("preserves the inverse wordmark presentation", () => {
    render(<MemoryRouter><Brand inverse /></MemoryRouter>);

    expect(screen.getByText("LiveOrder")).toHaveClass("text-white");
    expect(screen.getByRole("link", { name: "LiveOrder home" })).toBeInTheDocument();
  });
});
