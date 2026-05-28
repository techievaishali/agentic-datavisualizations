import { useState } from "react";
import { login, register } from "../api";

export default function AuthPanel({ onLoggedIn, onRegistered }) {
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await register(form);
        onRegistered?.(
          "Welcome to Agentic AI Dashboard. Upload a CSV, Excel (.xlsx/.xls), or XML file, then click Generate Report to visualize your data."
        );
      }
      await login({ email: form.email, password: form.password });
      onLoggedIn();
    } catch (err) {
      setError(err?.response?.data?.detail || "Authentication failed");
    }
  };

  return (
    <section className="auth-panel">
      <h2>{mode === "register" ? "Sign Up" : "Sign In"}</h2>
      <form onSubmit={submit}>
        {mode === "register" && (
          <input
            id="auth-fullname"
            name="full_name"
            placeholder="Full name"
            autoComplete="name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        )}
        <input
          id="auth-email"
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          id="auth-password"
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">{mode === "register" ? "Sign Up" : "Sign In"}</button>
      </form>
      <button className="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        Switch to {mode === "login" ? "Sign Up" : "Sign In"}
      </button>
    </section>
  );
}
