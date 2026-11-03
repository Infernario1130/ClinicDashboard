"use client";

import { useState } from "react";

const FONT = "'DM Sans',sans-serif";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setError(true);
    setPassword("");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#071C27", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form
        onSubmit={submit}
        style={{ width: "100%", maxWidth: 360, borderRadius: 14, background: "#0E3141", border: "1px solid rgba(79,201,214,.24)", boxShadow: "0 30px 70px rgba(0,0,0,.5)", padding: 26, display: "flex", flexDirection: "column", gap: 14 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" style={{ width: 44, height: 44, borderRadius: 10 }} />
        <div>
          <div style={{ font: `700 17px/1.25 ${FONT}`, color: "#EAF3F6" }}>Sangam Super Speciality Eye Hospital</div>
          <div style={{ font: `500 12px/1.4 ${FONT}`, color: "#7FA0B0", marginTop: 4 }}>Front desk · enter the desk password</div>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          style={{ padding: "12px 13px", borderRadius: 9, border: `1px solid ${error ? "rgba(240,120,110,.6)" : "rgba(255,255,255,.12)"}`, background: "rgba(255,255,255,.04)", color: "#EAF3F6", font: `500 14px/1.2 ${FONT}`, outline: "none" }}
        />
        {error && <div style={{ font: `500 12px/1.3 ${FONT}`, color: "#F2A49B" }}>Wrong password. Try again.</div>}
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "12px 16px", borderRadius: 9, border: "1px solid rgba(79,201,214,.5)", background: busy ? "rgba(79,201,214,.35)" : "#4FC9D6", color: "#062430", font: `700 13px/1 ${FONT}`, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Checking…" : "Open dashboard"}
        </button>
      </form>
    </div>
  );
}
