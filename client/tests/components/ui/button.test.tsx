import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../../../src/components/ui/button";

describe("Button", () => {
  it("exposes disabled state and does not invoke its action", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
