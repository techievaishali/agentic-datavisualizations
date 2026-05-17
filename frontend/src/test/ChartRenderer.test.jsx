/**
 * ChartRenderer.jsx 
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChartRenderer from "../components/ChartRenderer";

// Recharts uses ResizeObserver which is not in jsdom – stub it
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const baseWidget = {
  chart_type: "bar",
  x_field: "category",
  y_field: "revenue",
  color: "#1f77b4",
};

const sampleData = [
  { category: "A", revenue: 100 },
  { category: "B", revenue: 200 },
];

describe("ChartRenderer", () => {
  it("shows no-data message when data is empty", () => {
    render(<ChartRenderer widget={baseWidget} data={[]} />);

    expect(
      screen.getByText(/no data available/i)
    ).toBeInTheDocument();
  });

  it("renders kpi total when chart_type is kpi", () => {
    const widget = { ...baseWidget, chart_type: "kpi", x_field: null };
    render(<ChartRenderer widget={widget} data={sampleData} />);

    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("shows field-missing message when x_field or y_field is absent for non-kpi", () => {
    const widget = { ...baseWidget, x_field: null, y_field: null };
    render(<ChartRenderer widget={widget} data={sampleData} />);

    expect(screen.getByText(/set x and y fields/i)).toBeInTheDocument();
  });

  it("renders a container element for bar chart with data", () => {
    const { container } = render(
      <ChartRenderer widget={baseWidget} data={sampleData} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders a container element for line chart type", () => {
    const widget = { ...baseWidget, chart_type: "line" };
    const { container } = render(
      <ChartRenderer widget={widget} data={sampleData} />
    );
    expect(container.firstChild).toBeTruthy();
  });
});
