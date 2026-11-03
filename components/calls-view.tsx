"use client";

import { useEffect, useMemo, useState } from "react";
import type { CallOutcome, CallView } from "@/lib/calls";

const FONT = "'DM Sans',sans-serif";
const MONO = "'JetBrains Mono',monospace";
const POLL_MS = 15000;

const OUTCOMES: ("All" | CallOutcome)[] = ["All", "Missed", "Not booked", "Transferred", "Booked"];
const RANGES = ["Today", "Yesterday", "7 days"] as const;
type Range = (typeof RANGES)[number];

const TONE: Record<CallOutcome, { bg: string; fg: string; label: string }> = {
  Missed: { bg: "rgba(240,120,110,.14)", fg: "#F2A49B", label: "Missed / hung up" },
  "Not booked": { bg: "rgba(240,168,30,.14)", fg: "#F5C25E", label: "Answered, not booked" },
  Transferred: { bg: "rgba(150,140,240,.14)", fg: "#B9B2F5", label: "Transferred" },
  Booked: { bg: "rgba(79,201,214,.14)", fg: "#8FE3EC", label: "Booked" },
};

// Calls are stored in UTC; the desk thinks in IST.
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const istDayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function toCallBack(calls: CallView[]): number {
  const today = istDay(new Date().toISOString());
  return calls.filter((c) => istDay(c.started_at) === today && (c.outcome === "Missed" || c.outcome === "Not booked")).length;
}

export default function CallsView({ calls, setCalls }: { calls: CallView[]; setCalls: (c: CallView[]) => void }) {
  const [outcome, setOutcome] = useState<"All" | CallOutcome>("All");
  const [range, setRange] = useState<Range>("Today");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch("/api/calls").catch(() => null);
      if (res?.status === 401) window.location.reload();
      if (res?.ok) setCalls(await res.json());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [setCalls]);

  const visible = useMemo(() => {
    const now = new Date();
    const today = istDay(now.toISOString());
    const yesterday = istDay(new Date(now.getTime() - 86400000).toISOString());
    const q = query.replace(/\D/g, "");
    return calls.filter((c) => {
      const day = istDay(c.started_at);
      if (range === "Today" && day !== today) return false;
      if (range === "Yesterday" && day !== yesterday) return false;
      if (outcome !== "All" && c.outcome !== outcome) return false;
      if (q && !c.caller_number.replace(/\D/g, "").includes(q)) return false;
      return true;
    });
  }, [calls, outcome, range, query]);

  const days = useMemo(() => Array.from(new Set(visible.map((c) => istDay(c.started_at)))), [visible]);

  function copy(c: CallView) {
    navigator.clipboard?.writeText(c.caller_number).catch(() => {});
    setCopied(c.id);
    setTimeout(() => setCopied((p) => (p === c.id ? null : p)), 1200);
  }

  return (
    <div style={{ maxWidth: 1780, margin: "0 auto", padding: "20px 22px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search phone number"
          inputMode="numeric"
          style={{ flex: 1, minWidth: 200, maxWidth: 300, padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "#EAF3F6", font: `500 13px/1.2 ${FONT}`, outline: "none" }}
        />
        <Chips options={RANGES} value={range} onChange={setRange} />
        <Chips options={OUTCOMES} value={outcome} onChange={setOutcome} label={(o) => (o === "All" ? "All calls" : TONE[o].label)} />
      </div>

      <div style={{ font: `500 12px/1.4 ${FONT}`, color: "#7FA0B0", paddingBottom: 10 }}>
        {visible.length} {visible.length === 1 ? "call" : "calls"} · Missed = the caller hung up before speaking or within 10 seconds. Calls before 7:15 AM or after 8 PM aren&apos;t answered and don&apos;t appear here.
      </div>

      {!visible.length && (
        <div style={{ padding: 26, borderRadius: 11, border: "1px dashed rgba(255,255,255,.1)", textAlign: "center", font: `500 12.5px/1.4 ${FONT}`, color: "#7FA0B0" }}>
          No calls match this filter.
        </div>
      )}

      {days.map((day) => (
        <div key={day} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <div style={{ font: `700 12px/1 ${FONT}`, letterSpacing: ".12em", textTransform: "uppercase", color: "#8FAEBC", padding: "10px 2px 4px" }}>{istDayLabel(day)}</div>
          {visible
            .filter((c) => istDay(c.started_at) === day)
            .map((c) => (
              <div
                key={c.id}
                style={{ display: "grid", gridTemplateColumns: "78px 150px 190px 1fr", gap: 14, alignItems: "center", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)" }}
              >
                <span style={{ font: `600 13px/1.2 ${MONO}`, color: "#C9DDE5", fontVariantNumeric: "tabular-nums" }}>{istTime(c.started_at)}</span>
                <button
                  onClick={() => copy(c)}
                  title="Copy number"
                  style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", cursor: "pointer", font: `600 13px/1.2 ${MONO}`, color: copied === c.id ? "#8FE3EC" : "#EAF3F6", fontVariantNumeric: "tabular-nums" }}
                >
                  {copied === c.id ? "Copied" : c.caller_number || "—"}
                </button>
                <span style={{ justifySelf: "start", padding: "4px 10px", borderRadius: 20, background: TONE[c.outcome].bg, color: TONE[c.outcome].fg, font: `600 11.5px/1.3 ${FONT}`, whiteSpace: "nowrap" }}>
                  {TONE[c.outcome].label}
                  {c.duration_s !== null && ` · ${Math.round(c.duration_s)} s`}
                </span>
                <span style={{ font: `500 12.5px/1.4 ${FONT}`, color: "#B5CCD6" }}>
                  {c.summary || "—"}
                  {c.transfer_reason && <span style={{ color: "#8FAEBC" }}> · Reason: {c.transfer_reason}</span>}
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label?: (v: T) => string }) {
  return (
    <div style={{ display: "flex", gap: 5, padding: 4, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{ padding: "7px 12px", borderRadius: 6, cursor: "pointer", border: `1px solid ${value === o ? "rgba(79,201,214,.5)" : "transparent"}`, background: value === o ? "rgba(79,201,214,.15)" : "transparent", color: value === o ? "#A6ECF3" : "#8FAEBC", font: `600 12px/1 ${FONT}`, whiteSpace: "nowrap" }}
        >
          {label ? label(o) : o}
        </button>
      ))}
    </div>
  );
}
