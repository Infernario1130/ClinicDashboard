"use client";

/* eslint-disable react-hooks/refs -- ponytail: this component uses a handful of
 * plain useRef()s as instance bookkeeping (pending toast timers, an undo
 * callback), read/written only inside click handlers. The row list passes
 * those handlers down as props (onCancel, onToggleStatus, the per-field
 * onCopy in fieldsFor), which the new react-hooks/refs check flags because it
 * can't statically prove a child never invokes them during its own render.
 * React Compiler isn't enabled in next.config.ts, so this is a lint-only
 * concern, not a runtime one. Upgrade path if that changes: replace these
 * refs with useState, or hoist the handlers to useEffectEvent.
 */

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { Appointment, PatientType } from "@/lib/types";
import { TODAY, getAppointments } from "@/lib/mock-appointments";
import { addDays, dayLabel, fmtDate, fmtSlash, fmtTime } from "@/lib/format";

const ACCENT = "#4FC9D6";
const POLL_INTERVAL_MS = 5000;
const FONT = "'DM Sans',sans-serif";
const MONO = "'JetBrains Mono',monospace";

type FieldKey = "name" | "type" | "reason" | "date" | "time" | "phone" | "fee";
const KEYS: FieldKey[] = ["name", "type", "reason", "date", "time", "phone", "fee"];
const FIELD_PROP: Record<FieldKey, keyof Appointment> = {
  name: "patient_name",
  type: "patient_type",
  reason: "reason",
  date: "appointment_date",
  time: "assigned_time",
  phone: "phone_number",
  fee: "fee",
};
const FIELD_LABEL: Record<FieldKey, string> = {
  name: "Name",
  type: "Type",
  reason: "Reason",
  date: "Date",
  time: "Time",
  phone: "Phone",
  fee: "Fee",
};

const TYPE_LABEL: Record<PatientType, string> = {
  visited_recently: "Visited recently",
  not_recent: "Not recent",
};

interface FieldVM {
  key: FieldKey;
  label: string;
  value: string;
  isSelect: boolean;
  type: string;
  mono: boolean;
  readOnly: boolean;
  caption: string | null;
  options: string[] | null;
  isCopied: boolean;
  flashOn: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onCopy: () => void;
}

type FeedItem =
  | { kind: "header"; key: string; title: string; count: number; sub: string; tone: "a" | "b" | "date" }
  | { kind: "empty"; key: string; text: string }
  | { kind: "row"; key: string; appointment: Appointment };

const inputBase: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  padding: 0,
  colorScheme: "dark",
};

export default function AppointmentsDashboard({ initialAppointments }: { initialAppointments: Appointment[] }) {
  const [locked, setLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<"appts" | "sched">("appts");
  const [query, setQuery] = useState("");
  const [fRange, setFRange] = useState("All");
  const [fType, setFType] = useState("All");
  const [copied, setCopied] = useState<Record<string, Partial<Record<FieldKey, boolean>>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const [entering, setEntering] = useState<Record<string, boolean>>({});
  const [cancelled, setCancelled] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [appts, setAppts] = useState<Appointment[]>(initialAppointments);
  const [form, setForm] = useState({
    patient_name: "",
    patient_type: "not_recent" as PatientType,
    reason: "",
    appointment_date: TODAY,
    assigned_time: "11:00",
    phone_number: "",
    fee: "500",
  });

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1040);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Poll Supabase for rows the n8n backend has inserted since the page loaded.
  // We only ever ADD rows the dashboard doesn't already know about — existing
  // appointments (including "apt-new-*" walk-ins entered locally, and rows
  // whose status/cancelled state lives only in client state) are left alone,
  // so a poll can never clobber something the front desk is mid-edit on.
  useEffect(() => {
    let unmounted = false;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const fresh = await getAppointments();
        if (unmounted) return;

        let arrivals: Appointment[] = [];
        setAppts((prev) => {
          const knownIds = new Set(prev.map((a) => a.id));
          arrivals = fresh.filter((a) => !knownIds.has(a.id));
          return arrivals.length ? [...arrivals, ...prev] : prev;
        });

        if (arrivals.length) {
          setEntering((p) => {
            const next = { ...p };
            arrivals.forEach((a) => (next[a.id] = true));
            return next;
          });
          setTimeout(() => {
            setEntering((p) => {
              const next = { ...p };
              arrivals.forEach((a) => delete next[a.id]);
              return next;
            });
          }, 1000);

          showToast(
            arrivals.length === 1
              ? `${arrivals[0].patient_name} — new booking received`
              : `${arrivals.length} new appointments received`,
          );
        }
      } catch (err) {
        console.error("Appointment poll failed:", err);
      } finally {
        inFlight = false;
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      unmounted = true;
      clearInterval(id);
    };
  }, []);

  const newApptCounterRef = useRef(0);
  const undoRef = useRef<(() => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function showToast(msg: string, undo?: () => void) {
    undoRef.current = undo ?? null;
    setToast(msg);
    setCanUndo(!!undo);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      setCanUndo(false);
    }, undo ? 6000 : 3400);
  }

  function doUndo() {
    const fn = undoRef.current;
    undoRef.current = null;
    setToast(null);
    setCanUndo(false);
    fn?.();
  }

  function upd(id: string, patch: Partial<Appointment>) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function clearCopied(id: string) {
    setCopied((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function animateMove(id: string, patch: Partial<Appointment>, msg?: string, undo?: () => void) {
    setExiting((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
      setExiting((prev) => ({ ...prev, [id]: false }));
      setEntering((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setEntering((prev) => ({ ...prev, [id]: false })), 1000);
    }, 360);
    if (msg) showToast(msg, undo);
  }

  function markDone(a: Appointment, auto: boolean) {
    animateMove(
      a.id,
      { status: "Done" },
      auto ? `${a.patient_name} — all fields copied, marked done` : `${a.patient_name} marked done`,
      () => reopen(a, true),
    );
  }

  function reopen(a: Appointment, silent?: boolean) {
    clearCopied(a.id);
    animateMove(a.id, { status: "Needs entry" }, silent ? `${a.patient_name} reopened — copy marks cleared` : `${a.patient_name} reopened into Needs entry`);
  }

  function doCopy(id: string, key: FieldKey, text: string) {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ponytail: clipboard write can silently fail on unsupported/insecure contexts, no fallback needed for an internal desk tool
    }
    const row = { ...(copied[id] || {}), [key]: true };
    setCopied((prev) => ({ ...prev, [id]: row }));
    setFlash(`${id}:${key}`);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 650);
    const a = appts.find((x) => x.id === id);
    if (a) {
      const all = KEYS.every((k) => row[k]);
      if (all && a.status !== "Done") setTimeout(() => markDone(a, true), 240);
    }
  }

  function commitEdit(a: Appointment, key: FieldKey, raw: string) {
    const prop = FIELD_PROP[key];
    const old = a[prop];
    const val: string | number = raw;
    const dk = `${a.id}.${key}`;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[dk];
      return next;
    });
    if (String(val) === String(old)) return;
    upd(a.id, { [prop]: val } as Partial<Appointment>);
    showToast(`${FIELD_LABEL[key]} updated — ${a.patient_name}`, () => upd(a.id, { [prop]: old } as Partial<Appointment>));
  }

  function cancelRow(a: Appointment) {
    const isCancelled = !!cancelled[a.id];
    if (isCancelled) {
      setCancelled((prev) => ({ ...prev, [a.id]: false }));
      showToast(`${a.patient_name} restored`);
      return;
    }
    setCancelled((prev) => ({ ...prev, [a.id]: true }));
    upd(a.id, { status: "Needs entry" });
    clearCopied(a.id);
    showToast(`${a.patient_name} cancelled — remove from Docbox`, () => setCancelled((prev) => ({ ...prev, [a.id]: false })));
  }

  function fieldsFor(a: Appointment): FieldVM[] {
    const c = copied[a.id] || {};
    const mk = (key: FieldKey, opts: Partial<FieldVM> = {}): FieldVM => {
      const dk = `${a.id}.${key}`;
      const draft = drafts[dk];
      const raw = draft !== undefined ? draft : String(a[FIELD_PROP[key]]);
      return {
        key,
        label: FIELD_LABEL[key],
        value: raw,
        isSelect: false,
        type: "text",
        mono: false,
        readOnly: false,
        caption: null,
        options: null,
        isCopied: !!c[key],
        flashOn: flash === `${a.id}:${key}`,
        onChange: (v) => setDrafts((prev) => ({ ...prev, [dk]: v })),
        onBlur: () => commitEdit(a, key, drafts[dk] ?? raw),
        onCopy: () => doCopy(a.id, key, (opts.value as string) ?? String(a[FIELD_PROP[key]])),
        ...opts,
      };
    };

    const name = mk("name");
    const dateF = mk("date", {
      type: "date",
      mono: true,
      value: a.appointment_date,
      caption: dayLabel(a.appointment_date, TODAY),
      onCopy: () => doCopy(a.id, "date", fmtSlash(a.appointment_date)),
    });
    const timeF = mk("time", {
      type: "time",
      mono: true,
      value: a.assigned_time,
      caption: fmtTime(a.assigned_time),
      onCopy: () => doCopy(a.id, "time", fmtTime(a.assigned_time)),
    });
    return [
      name,
      mk("type", {
        isSelect: true,
        value: TYPE_LABEL[a.patient_type],
        options: [TYPE_LABEL[a.patient_type], TYPE_LABEL[a.patient_type === "visited_recently" ? "not_recent" : "visited_recently"]],
        onChange: (v) => upd(a.id, { patient_type: (v === TYPE_LABEL.visited_recently ? "visited_recently" : "not_recent") as PatientType }),
        onCopy: () => doCopy(a.id, "type", TYPE_LABEL[a.patient_type]),
      }),
      mk("reason"),
      dateF,
      timeF,
      mk("phone", { mono: true }),
      mk("fee", {
        mono: true,
        readOnly: true,
        value: `₹${a.fee}`,
        caption: a.fee === 0 ? "No consult fee" : "Payable at desk",
        onCopy: () => doCopy(a.id, "fee", String(a.fee)),
      }),
    ];
  }

  const q = query.trim().toLowerCase();
  const inRange = (a: Appointment) => {
    if (fRange === "Today") return a.appointment_date === TODAY;
    if (fRange === "Tomorrow") return a.appointment_date === addDays(TODAY, 1);
    if (fRange === "Next 7 days") return a.appointment_date >= TODAY && a.appointment_date <= addDays(TODAY, 7);
    return true;
  };
  const visible = useMemo(
    () =>
      appts.filter((a) => {
        if (q && !a.patient_name.toLowerCase().includes(q) && !a.phone_number.includes(q)) return false;
        if (fType !== "All") {
          const want: PatientType = fType === "Visited recently" ? "visited_recently" : "not_recent";
          if (a.patient_type !== want) return false;
        }
        return inRange(a);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appts, q, fType, fRange],
  );

  const needs = useMemo(
    () => visible.filter((a) => a.status !== "Done"),
    [visible],
  );
  const doneList = useMemo(() => visible.filter((a) => a.status === "Done"), [visible]);
  const dates = useMemo(() => Array.from(new Set(doneList.map((a) => a.appointment_date))).sort(), [doneList]);

  const filtersActive = !!q || fType !== "All" || fRange !== "All";

  const feed: FeedItem[] = useMemo(() => {
    if (tab === "sched") {
      const out: FeedItem[] = [
        { kind: "header", key: "h-sched", title: "Scheduled", count: doneList.length, sub: "Already entered into Docbox · grouped by appointment day", tone: "b" },
      ];
      if (!doneList.length) {
        out.push({ kind: "empty", key: "e-sched", text: filtersActive ? "No entered appointments match this search or filter." : "Nothing entered into Docbox yet." });
      }
      dates.forEach((dt) => {
        const rows = doneList.filter((a) => a.appointment_date === dt).sort((x, y) => x.assigned_time.localeCompare(y.assigned_time));
        out.push({ kind: "header", key: `h-${dt}`, title: dayLabel(dt, TODAY), count: rows.length, sub: "", tone: "date" });
        rows.forEach((a) => out.push({ kind: "row", key: a.id, appointment: a }));
      });
      return out;
    }
    const out: FeedItem[] = [
      { kind: "header", key: "h-needs", title: "Needs entry", count: needs.length, sub: "Newest bookings first", tone: "a" },
    ];
    if (!needs.length) {
      out.push({ kind: "empty", key: "e-needs", text: filtersActive ? "No pending appointments match this search or filter." : "Queue clear — every appointment has been entered into Docbox." });
    }
    needs.forEach((a) => out.push({ kind: "row", key: a.id, appointment: a }));
    return out;
  }, [tab, needs, doneList, dates, filtersActive]);

  function press(k: string) {
    if (k === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (k === "go") {
      setLocked(false);
      return;
    }
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) setTimeout(() => setLocked(false), 340);
      return next;
    });
  }

  function setFormField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submitForm() {
    const name = form.patient_name.trim();
    if (!name) {
      showToast("Enter a patient name first");
      return;
    }
    newApptCounterRef.current += 1;
    const id = `apt-new-${newApptCounterRef.current}`;
    const rec: Appointment = {
      id,
      patient_name: name,
      patient_type: form.patient_type,
      reason: form.reason || "Walk-in — taken at front desk",
      appointment_date: form.appointment_date,
      assigned_time: form.assigned_time,
      phone_number: form.phone_number,
      fee: parseInt(form.fee, 10),
      status: "Needs entry",
    };
    setAppts((prev) => [rec, ...prev]);
    setFormOpen(false);
    setEntering((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setEntering((prev) => ({ ...prev, [id]: false })), 1000);
    setForm({ patient_name: "", patient_type: "not_recent", reason: "", appointment_date: TODAY, assigned_time: "11:00", phone_number: "", fee: "500" });
    showToast(`${name} added to Needs entry`, () => setAppts((prev) => prev.filter((a) => a.id !== id)));
  }

  if (locked) {
    return <LockScreen pin={pin} onPress={press} />;
  }

  const feedItems = feed.map((item) => {
    if (item.kind === "header") return <FeedHeader key={item.key} title={item.title} count={item.count} sub={item.sub} tone={item.tone} />;
    if (item.kind === "empty")
      return (
        <div key={item.key} style={{ padding: 26, borderRadius: 11, border: "1px dashed rgba(255,255,255,.1)", textAlign: "center", font: `500 12.5px/1.4 ${FONT}`, color: "#7FA0B0" }}>
          {item.text}
        </div>
      );
    const a = item.appointment;
    return (
      <AppointmentRow
        key={item.key}
        appointment={a}
        fields={fieldsFor(a)}
        narrow={narrow}
        exiting={!!exiting[a.id]}
        entering={!!entering[a.id]}
        cancelled={!!cancelled[a.id]}
        onToggleStatus={() => (a.status === "Done" ? reopen(a) : markDone(a, false))}
        onCancel={() => cancelRow(a)}
      />
    );
  });

  return (
    <div style={{ minHeight: "100vh", background: "#071C27", color: "#EAF3F6", paddingBottom: 120 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "#0B2A38", borderBottom: "1px solid rgba(79,201,214,.16)", boxShadow: "0 10px 28px rgba(0,0,0,.32)" }}>
        <div style={{ maxWidth: 1780, margin: "0 auto", padding: "12px 22px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" style={{ width: 38, height: 38, borderRadius: 9, display: "block", flex: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 4 }}>
            <div style={{ font: `700 15px/1.2 ${FONT}`, color: "#EAF3F6", letterSpacing: "-.01em" }}>Sangam Super Speciality Eye Hospital</div>
            <div style={{ font: `500 11px/1.2 ${FONT}`, color: "#7FA0B0", letterSpacing: ".04em", textTransform: "uppercase" }}>Appointments desk · Taramandal, Gorakhpur</div>
          </div>
          <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10 }}>
            <button onClick={() => { setTab("appts"); window.scrollTo(0, 0); }} style={tabStyle(tab === "appts")}>
              Appointments
            </button>
            <button onClick={() => { setTab("sched"); window.scrollTo(0, 0); }} style={tabStyle(tab === "sched")}>
              Scheduled · {appts.filter((a) => a.status === "Done").length}
            </button>
          </div>
          <span style={{ flex: 1, minWidth: 12 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "right" }}>
            <div style={{ font: `600 13px/1.2 ${MONO}`, color: "#C9DDE5", fontVariantNumeric: "tabular-nums" }}>{fmtDate(TODAY)} 2026</div>
            <div style={{ font: `500 11px/1.2 ${FONT}`, color: "#7FA0B0" }}>Front desk · Docbox entry</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px", borderRadius: 10, background: "rgba(240,168,30,.12)", border: "1px solid rgba(240,168,30,.4)", color: "#F5C25E" }}>
            <span style={{ font: `700 20px/1 ${MONO}`, fontVariantNumeric: "tabular-nums" }}>{appts.filter((a) => a.status !== "Done").length}</span>
            <span style={{ font: `600 10.5px/1.25 ${FONT}`, letterSpacing: ".07em", textTransform: "uppercase", opacity: 0.85, whiteSpace: "nowrap" }}>to enter in Docbox</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1780, margin: "0 auto", padding: "20px 22px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 240, maxWidth: 400 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient name or phone number"
              style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 9, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "#EAF3F6", font: `500 13px/1.2 ${FONT}`, outline: "none" }}
            />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", font: `600 12px/1 ${FONT}`, color: "#6E92A2" }}>⌕</span>
          </div>
          <div style={{ display: "flex", gap: 5, padding: 4, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9 }}>
            {["All", "Today", "Tomorrow", "Next 7 days"].map((r) => (
              <button key={r} onClick={() => setFRange(r)} style={chipStyle(fRange === r)}>
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, padding: 4, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9 }}>
            {["All", "Visited recently", "Not recent"].map((t) => (
              <button key={t} onClick={() => setFType(t)} style={chipStyle(fType === t)}>
                {t === "All" ? "All patients" : t}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setFormOpen(true)}
            style={{ padding: "10px 15px", borderRadius: 9, border: "1px solid rgba(79,201,214,.45)", background: "rgba(79,201,214,.13)", color: "#8FE3EC", font: `600 12.5px/1 ${FONT}`, cursor: "pointer", letterSpacing: ".01em", whiteSpace: "nowrap", flex: "none" }}
          >
            + New appointment
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{feedItems}</div>
      </div>

      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(4,14,20,.72)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px", overflow: "auto", backdropFilter: "blur(3px)" }}>
          <div style={{ width: "100%", maxWidth: 620, borderRadius: 14, background: "#0E3141", border: "1px solid rgba(79,201,214,.24)", boxShadow: "0 30px 70px rgba(0,0,0,.5)", padding: 22, animation: "omPop .22s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ font: `700 17px/1.2 ${FONT}`, color: "#EAF3F6" }}>New appointment</div>
                <div style={{ font: `500 12px/1.3 ${FONT}`, color: "#7FA0B0" }}>Walk-in or call taken at the desk. Enters the top of Needs entry.</div>
              </div>
              <span style={{ flex: 1 }} />
              <button onClick={() => setFormOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#8FAEBC", font: `500 15px/1 ${FONT}`, cursor: "pointer" }}>
                ×
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
              <NewApptField label="Patient name" value={form.patient_name} onChange={(v) => setFormField("patient_name", v)} placeholder="Full name as spoken" />
              <NewApptSelect
                label="Patient type"
                value={TYPE_LABEL[form.patient_type]}
                onChange={(v) => setFormField("patient_type", (v === TYPE_LABEL.visited_recently ? "visited_recently" : "not_recent") as PatientType)}
                options={[TYPE_LABEL.not_recent, TYPE_LABEL.visited_recently]}
              />
              <NewApptField label="Reason as described" value={form.reason} onChange={(v) => setFormField("reason", v)} placeholder="What the patient said" wide />
              <NewApptField label="Appointment date" value={form.appointment_date} onChange={(v) => setFormField("appointment_date", v)} type="date" mono />
              <NewApptField label="Preferred time" value={form.assigned_time} onChange={(v) => setFormField("assigned_time", v)} type="time" mono />
              <NewApptField label="Phone number" value={form.phone_number} onChange={(v) => setFormField("phone_number", v)} placeholder="10 digits" mono />
              <NewApptSelect label="Fee ₹ (set at booking, not computed)" value={form.fee} onChange={(v) => setFormField("fee", v)} options={["500", "0"]} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
              <span style={{ flex: 1 }} />
              <button onClick={() => setFormOpen(false)} style={{ padding: "11px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#8FAEBC", font: `600 12.5px/1 ${FONT}`, cursor: "pointer" }}>
                Discard
              </button>
              <button onClick={() => submitForm()} style={{ padding: "11px 20px", borderRadius: 9, border: "1px solid rgba(79,201,214,.5)", background: "#4FC9D6", color: "#062430", font: `700 12.5px/1 ${FONT}`, cursor: "pointer" }}>
                Add to Needs entry
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 90, display: "flex", alignItems: "center", gap: 14, padding: "12px 14px 12px 16px", borderRadius: 11, background: "#123A4C", border: "1px solid rgba(79,201,214,.32)", boxShadow: "0 18px 44px rgba(0,0,0,.46)", animation: "omPop .18s ease both", maxWidth: "92vw" }}>
          <span style={{ font: `500 13px/1.35 ${FONT}`, color: "#E4F1F5" }}>{toast}</span>
          {canUndo && (
            <button onClick={doUndo} style={{ padding: "7px 13px", borderRadius: 7, border: "1px solid rgba(79,201,214,.5)", background: "rgba(79,201,214,.14)", color: "#8FE3EC", font: `700 11.5px/1 ${FONT}`, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "9px 14px",
    borderRadius: 7,
    cursor: "pointer",
    border: "none",
    whiteSpace: "nowrap",
    background: active ? "rgba(79,201,214,.16)" : "transparent",
    color: active ? "#A6ECF3" : "#8FAEBC",
    font: `600 12.5px/1 ${FONT}`,
    boxShadow: active ? "inset 0 0 0 1px rgba(79,201,214,.45)" : "none",
  };
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${active ? "rgba(79,201,214,.5)" : "transparent"}`,
    background: active ? "rgba(79,201,214,.15)" : "transparent",
    color: active ? "#A6ECF3" : "#8FAEBC",
    font: `600 12px/1 ${FONT}`,
    whiteSpace: "nowrap",
  };
}

function LockScreen({ pin, onPress }: { pin: string; onPress: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"];
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(120% 90% at 50% 0%, #10394B 0%, #071C27 62%)", fontFamily: FONT, padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 352, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sangam Eye Hospital" style={{ width: 76, height: 76, borderRadius: 16, display: "block" }} />
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ font: `700 19px/1.25 ${FONT}`, color: "#EAF3F6", letterSpacing: "-.01em" }}>Sangam Super Speciality Eye Hospital</div>
          <div style={{ font: `500 12px/1.4 ${FONT}`, color: "#7FA0B0", letterSpacing: ".02em" }}>Front desk · Appointments desk access</div>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                display: "block",
                border: `1.5px solid ${i < pin.length ? ACCENT : "rgba(255,255,255,.22)"}`,
                background: i < pin.length ? ACCENT : "transparent",
                transition: "all .15s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,86px)", gap: 12 }}>
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => onPress(k)}
              style={{
                width: 86,
                height: 58,
                borderRadius: 11,
                cursor: "pointer",
                border: `1px solid ${k === "del" || k === "go" ? "rgba(79,201,214,.3)" : "rgba(255,255,255,.12)"}`,
                background: "rgba(255,255,255,.035)",
                color: k === "del" || k === "go" ? "#8FE3EC" : "#EAF3F6",
                font: `500 20px/1 ${MONO}`,
                transition: "all .12s ease",
              }}
            >
              {k === "del" ? "⌫" : k === "go" ? "→" : k}
            </button>
          ))}
        </div>
        <div style={{ font: `500 11.5px/1.4 ${FONT}`, color: "#5C7C8C", textAlign: "center" }}>Enter any 4 digits · prototype access</div>
      </div>
    </div>
  );
}

function FeedHeader({ title, count, sub, tone }: { title: string; count: number; sub: string; tone: "a" | "b" | "date" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        flexWrap: "wrap",
        padding: tone === "date" ? "14px 2px 2px" : "18px 2px 4px",
        borderBottom: tone === "date" ? "none" : "1px solid rgba(255,255,255,.08)",
        marginBottom: tone === "date" ? 0 : 4,
      }}
    >
      <span
        style={
          tone === "date"
            ? { font: `700 12px/1 ${FONT}`, letterSpacing: ".12em", textTransform: "uppercase", color: "#8FAEBC" }
            : { font: `700 17px/1.1 ${FONT}`, letterSpacing: "-.01em", color: tone === "a" ? "#F5C25E" : ACCENT }
        }
      >
        {title}
      </span>
      <span
        style={{
          padding: "3px 9px",
          borderRadius: 20,
          font: `700 11.5px/1.35 ${MONO}`,
          fontVariantNumeric: "tabular-nums",
          background: tone === "a" ? "rgba(240,168,30,.15)" : tone === "date" ? "rgba(255,255,255,.05)" : "rgba(79,201,214,.13)",
          color: tone === "a" ? "#F5C25E" : tone === "date" ? "#8FAEBC" : "#8FE3EC",
        }}
      >
        {count}
      </span>
      {sub && <span style={{ font: `500 11.5px/1.3 ${FONT}`, color: "#7FA0B0" }}>{sub}</span>}
    </div>
  );
}

function AppointmentRow({
  appointment: a,
  fields,
  narrow,
  exiting,
  entering,
  cancelled,
  onToggleStatus,
  onCancel,
}: {
  appointment: Appointment;
  fields: FieldVM[];
  narrow: boolean;
  exiting: boolean;
  entering: boolean;
  cancelled: boolean;
  onToggleStatus: () => void;
  onCancel: () => void;
}) {
  const done = a.status === "Done";
  let edge = "rgba(255,255,255,.07)";
  if (cancelled) edge = "#CE1E2D";
  else if (done) edge = "rgba(79,201,214,.4)";

  const anim = exiting ? "omOut .36s ease forwards" : entering ? "omIn .34s ease both, omGlow 1s ease .1s both" : "none";
  const shellStyle: CSSProperties = {
    position: "relative",
    padding: "11px 14px 12px",
    borderRadius: 10,
    background: done ? "rgba(255,255,255,.028)" : "rgba(255,255,255,.05)",
    border: `1px solid ${cancelled ? "rgba(206,30,45,.3)" : "rgba(255,255,255,.07)"}`,
    borderLeft: `3px solid ${edge}`,
    opacity: cancelled ? 0.72 : 1,
    animation: anim,
    overflow: "hidden",
  };
  const gridStyle: CSSProperties = narrow
    ? { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(162px,1fr))", gap: 6 }
    : { display: "grid", gridTemplateColumns: "minmax(170px,1.7fr) 116px minmax(200px,2.1fr) 152px 116px 148px 92px", gap: 6, alignItems: "start" };

  const statusStyle: CSSProperties = {
    padding: "7px 12px",
    borderRadius: 7,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: `1px solid ${done ? "rgba(79,201,214,.5)" : "rgba(240,168,30,.5)"}`,
    background: done ? "rgba(79,201,214,.16)" : "rgba(240,168,30,.12)",
    color: done ? "#A6ECF3" : "#F5C25E",
    font: `700 11px/1 ${FONT}`,
    letterSpacing: ".05em",
    textTransform: "uppercase",
  };
  const cancelStyle: CSSProperties = {
    padding: "7px 11px",
    borderRadius: 7,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: `1px solid ${cancelled ? "rgba(79,201,214,.4)" : "rgba(228,72,60,.4)"}`,
    background: "transparent",
    color: cancelled ? "#8FE3EC" : "#E88379",
    font: `600 11px/1 ${FONT}`,
    letterSpacing: ".05em",
    textTransform: "uppercase",
  };

  return (
    <div style={shellStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ flex: 1, minWidth: 8 }} />
        <button onClick={onToggleStatus} style={statusStyle} title="Toggle entry status">
          {done ? "✓ Entered in Docbox" : "Needs entry"}
        </button>
        <button onClick={onCancel} style={cancelStyle}>
          {cancelled ? "Restore" : "Cancel"}
        </button>
      </div>
      <div style={gridStyle}>
        {fields.map((f) => (
          <FieldBox key={f.key} field={f} cancelled={cancelled} />
        ))}
      </div>
    </div>
  );
}

function FieldBox({ field: f, cancelled }: { field: FieldVM; cancelled: boolean }) {
  const boxStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "7px 9px 8px",
    borderRadius: 7,
    minWidth: 0,
    background: f.flashOn ? "rgba(79,201,214,.2)" : f.isCopied ? "rgba(79,201,214,.055)" : "rgba(255,255,255,.022)",
    border: `1px solid ${f.flashOn ? ACCENT : f.isCopied ? "rgba(79,201,214,.42)" : "rgba(255,255,255,.075)"}`,
    transition: "background .2s ease, border-color .2s ease",
  };
  const inputStyle: CSSProperties = {
    ...inputBase,
    minWidth: 0,
    color: f.readOnly ? "#A9C6D1" : "#EAF3F6",
    font: f.mono ? `500 13.5px/1.35 ${MONO}` : `500 13.5px/1.35 ${FONT}`,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: f.mono ? ".02em" : 0,
    textDecoration: cancelled ? "line-through" : "none",
    cursor: f.readOnly ? "default" : "text",
  };
  const copyStyle: CSSProperties = {
    marginLeft: "auto",
    flex: "none",
    padding: "3px 6px",
    borderRadius: 5,
    cursor: "pointer",
    border: `1px solid ${f.isCopied ? "rgba(79,201,214,.5)" : "rgba(79,201,214,.42)"}`,
    background: f.isCopied ? "rgba(79,201,214,.2)" : "rgba(10,40,52,.94)",
    color: f.isCopied ? "#CBF3F7" : "#8FE3EC",
    font: `700 9.5px/1 ${FONT}`,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  return (
    <div className="fld" style={boxStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 18 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flex: "none",
            background: f.isCopied ? ACCENT : "transparent",
            boxShadow: f.isCopied ? "0 0 0 3px rgba(79,201,214,.16)" : "none",
            transition: "background .2s ease",
          }}
        />
        <span style={{ font: `600 9.5px/1 ${FONT}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#7FA0B0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</span>
        <button className="cp" onClick={f.onCopy} style={copyStyle} title="Copy this field">
          {f.isCopied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      {f.isSelect ? (
        <select value={f.value} onChange={(e) => f.onChange(e.target.value)} style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}>
          {(f.options || []).map((o) => (
            <option key={o} value={o} style={{ background: "#0B2A38", color: "#EAF3F6" }}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input type={f.type} value={f.value} readOnly={f.readOnly} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} style={inputStyle} />
      )}
      {f.caption && <div style={{ font: `500 10.5px/1.2 ${MONO}`, color: "#75A0AF", fontVariantNumeric: "tabular-nums" }}>{f.caption}</div>}
    </div>
  );
}

function NewApptField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px 9px", borderRadius: 8, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.09)", minWidth: 0, gridColumn: wide ? "1 / -1" : "auto" }}>
      <span style={{ font: `600 9.5px/1 ${FONT}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#7FA0B0" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputBase, color: "#EAF3F6", font: mono ? `500 13.5px/1.35 ${MONO}` : `500 13.5px/1.35 ${FONT}`, fontVariantNumeric: "tabular-nums" }}
      />
    </label>
  );
}

function NewApptSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px 9px", borderRadius: 8, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.09)", minWidth: 0 }}>
      <span style={{ font: `600 9.5px/1 ${FONT}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#7FA0B0" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputBase, color: "#EAF3F6", font: `500 13.5px/1.35 ${FONT}`, cursor: "pointer", appearance: "none" }}>
        {options.map((o) => (
          <option key={o} value={o} style={{ background: "#0B2A38", color: "#EAF3F6" }}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}