"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Login failed");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="shell" style={{ padding: "4rem 0" }}>
      <section
        className="glass-card"
        style={{ maxWidth: 520, margin: "0 auto", padding: "2rem" }}
      >
        <h1 style={{ marginTop: 0 }}>Cluso Admin Login</h1>
        <p style={{ color: "#486483" }}>
          Admin portal to issue customer logins and approve requests.
        </p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ margin: 0, color: "#c62828" }}>{error}</p>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}
