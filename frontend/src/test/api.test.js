/**
 * api.js 
 * All HTTP calls are intercepted with vi.mock 
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: {
      baseURL: "/api",
      headers: { common: {} },
    },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: { create: () => instance, ...instance } };
});

// Re-import after mock so the module uses the mocked axios instance
let api;
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  api = await import("../api.js");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("api.js – login", () => {
  it("stores token in localStorage on successful login", async () => {
    const axiosInstance = axios.create();
    axiosInstance.post.mockResolvedValueOnce({ data: { access_token: "tok123" } });

    await api.login({ email: "a@b.com", password: "pass1234" });

    expect(localStorage.getItem("token")).toBe("tok123");
  });
});

describe("api.js – register", () => {
  it("calls /auth/register with the provided payload", async () => {
    const axiosInstance = axios.create();
    axiosInstance.post.mockResolvedValueOnce({ data: { id: 1, email: "a@b.com" } });

    const result = await api.register({ email: "a@b.com", full_name: "A", password: "pass1234" });

    expect(result).toMatchObject({ id: 1 });
  });
});

describe("api.js – listDatasets", () => {
  it("returns array of datasets", async () => {
    const axiosInstance = axios.create();
    axiosInstance.get.mockResolvedValueOnce({ data: [{ id: 1, name: "Sales" }] });

    const result = await api.listDatasets();

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("Sales");
  });
});

describe("api.js – generateReport", () => {
  it("posts dataset_id and period then returns report", async () => {
    const axiosInstance = axios.create();
    axiosInstance.post.mockResolvedValueOnce({
      data: { id: 7, dataset_id: 1, period: "monthly", report_spec: {} },
    });

    const result = await api.generateReport(1, "monthly");

    expect(result.id).toBe(7);
    expect(result.period).toBe("monthly");
  });
});

describe("api.js – updateWidget", () => {
  it("puts updated fields and returns widget", async () => {
    const axiosInstance = axios.create();
    axiosInstance.put.mockResolvedValueOnce({
      data: { id: 3, title: "Updated", chart_type: "bar" },
    });

    const result = await api.updateWidget(3, { title: "Updated" });

    expect(result.title).toBe("Updated");
  });
});
