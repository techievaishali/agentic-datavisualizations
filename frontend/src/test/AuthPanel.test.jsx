/**
 * AuthPanel.jsx 
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AuthPanel from "../components/AuthPanel";

vi.mock("../api", () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

import * as api from "../api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthPanel – login mode", () => {
  it("renders email and password fields in login mode", () => {
    render(<AuthPanel onLoggedIn={() => {}} />);

    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Full name")).not.toBeInTheDocument();
  });

  it("calls login with entered credentials on form submit", async () => {
    api.login.mockResolvedValueOnce({ access_token: "tok" });
    const onLoggedIn = vi.fn();
    render(<AuthPanel onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "pass1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({
      email: "user@test.com",
      password: "pass1234",
    }));
  });

  it("calls onLoggedIn callback after successful login", async () => {
    api.login.mockResolvedValueOnce({ access_token: "tok" });
    const onLoggedIn = vi.fn();
    render(<AuthPanel onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "pass1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  });

  it("shows error message on failed login", async () => {
    api.login.mockRejectedValueOnce({
      response: { data: { detail: "Invalid credentials" } },
    });
    render(<AuthPanel onLoggedIn={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "bad@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() =>
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument()
    );
  });

  it("switches to register mode when toggle button clicked", () => {
    render(<AuthPanel onLoggedIn={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /switch to sign up/i }));

    expect(screen.getByPlaceholderText("Full name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
  });
});
