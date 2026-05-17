/**
 * WidgetCard.jsx 
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import WidgetCard from "../components/WidgetCard";

vi.mock("../api", () => ({
  updateWidget: vi.fn(),
  deleteWidget: vi.fn(),
  getWidgetSummary: vi.fn(),
}));

vi.mock("./ChartRenderer", () => ({
  default: () => <div data-testid="chart-renderer" />,
}));

import * as api from "../api";

// Recharts ResizeObserver stub
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const baseWidget = {
  id: 1,
  title: "Revenue KPI",
  chart_type: "kpi",
  x_field: null,
  y_field: "revenue",
  color: "#1f77b4",
  pattern: "solid",
  config: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("WidgetCard", () => {
  it("renders widget title", () => {
    render(
      <WidgetCard
        widget={baseWidget}
        periodData={[{ revenue: 100 }]}
        columns={["revenue"]}
        onUpdated={vi.fn()}
        isSelected={false}
        onToggleSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Revenue KPI")).toBeInTheDocument();
  });

  it("shows customize form when Customize button is clicked", () => {
    render(
      <WidgetCard
        widget={baseWidget}
        periodData={[]}
        columns={["revenue"]}
        onUpdated={vi.fn()}
        isSelected={false}
        onToggleSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /customize/i }));

    expect(screen.getByRole("button", { name: /save widget/i })).toBeInTheDocument();
  });

  it("calls updateWidget and onUpdated on save", async () => {
    api.updateWidget.mockResolvedValueOnce({ ...baseWidget, title: "New Title" });
    const onUpdated = vi.fn();

    render(
      <WidgetCard
        widget={baseWidget}
        periodData={[]}
        columns={["revenue"]}
        onUpdated={onUpdated}
        isSelected={false}
        onToggleSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /customize/i }));
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));

    await waitFor(() => expect(api.updateWidget).toHaveBeenCalledWith(1, expect.any(Object)));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it("calls deleteWidget and onUpdated after confirmed delete", async () => {
    api.deleteWidget.mockResolvedValueOnce({});
    const onUpdated = vi.fn();

    render(
      <WidgetCard
        widget={baseWidget}
        periodData={[]}
        columns={["revenue"]}
        onUpdated={onUpdated}
        isSelected={false}
        onToggleSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(api.deleteWidget).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it("fetches and displays AI summary when Graph Analysis is clicked", async () => {
    api.getWidgetSummary.mockResolvedValueOnce({
      text: "Revenue peaked in Q2.",
      mode: "fallback",
      provider: "deterministic",
      model: "rules",
      status: "provider not configured",
    });

    render(
      <WidgetCard
        widget={baseWidget}
        periodData={[{ revenue: 100 }]}
        columns={["revenue"]}
        onUpdated={vi.fn()}
        isSelected={false}
        onToggleSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /graph analysis/i }));

    await waitFor(() =>
      expect(screen.getByText("Revenue peaked in Q2.")).toBeInTheDocument()
    );
  });
});
