import { useState } from "react";
import { login, register } from "../api";

export default function AuthPanel({ onLoggedIn }) {
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await register(form);
      }
      await login({ email: form.email, password: form.password });
      onLoggedIn();
    } catch (err) {
      setError(err?.response?.data?.detail || "Authentication failed");
    }
  };

  return (
    <section className="card auth-panel">
      <h2>Secure Access</h2>
      <p>Register once, then sign in to use the autonomous dashboard pipeline.</p>
      <form onSubmit={submit}>
        {mode === "register" && (
          <input
            placeholder="Full name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
        )}
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">{mode === "register" ? "Register + Login" : "Login"}</button>
      </form>
      <button className="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        Switch to {mode === "login" ? "register" : "login"}
      </button>
    </section>
  );
}
