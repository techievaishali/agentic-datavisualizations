/**
 * UploadZone.jsx 
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import UploadZone from "../components/UploadZone";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UploadZone", () => {
  it("renders the upload area and upload file button", () => {
    render(<UploadZone onUpload={vi.fn()} />);

    expect(screen.getByText(/drop your data file here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload file/i })).toBeInTheDocument();
  });

  it("renders dataset name input field", () => {
    render(<UploadZone onUpload={vi.fn()} />);

    expect(screen.getByPlaceholderText("Dataset name")).toBeInTheDocument();
  });

  it("calls onUpload with inferred name from file when name is empty", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<UploadZone onUpload={onUpload} />);

    const file = new File(["col1,col2\n1,2"], "sales_data.csv", { type: "text/csv" });
    const input = document.querySelector("input[type='file']");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith("sales_data", file)
    );
  });

  it("calls onUpload with custom name when name is filled in", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<UploadZone onUpload={onUpload} />);

    fireEvent.change(screen.getByPlaceholderText("Dataset name"), {
      target: { value: "My Dataset" },
    });

    const file = new File(["a,b\n1,2"], "file.csv", { type: "text/csv" });
    const input = document.querySelector("input[type='file']");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith("My Dataset", file)
    );
  });

  it("applies dragging class on drag-over and removes it on drag-leave", () => {
    render(<UploadZone onUpload={vi.fn()} />);

    const zone = document.querySelector(".upload-zone");
    fireEvent.dragOver(zone, { preventDefault: () => {} });
    expect(zone.classList.contains("dragging")).toBe(true);

    fireEvent.dragLeave(zone);
    expect(zone.classList.contains("dragging")).toBe(false);
  });

  it("shows compact unsupported format error and skips upload", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<UploadZone onUpload={onUpload} />);

    const file = new File(["dummy"], "notes.txt", { type: "text/plain" });
    const input = document.querySelector("input[type='file']");
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText("Unsupported file format. Please upload CSV, Excel, or XML")
    ).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
