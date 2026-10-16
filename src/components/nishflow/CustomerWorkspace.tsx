import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, Info, Paperclip, ShieldCheck, UploadCloud, X } from "lucide-react";
import { BANK, MAX_REVISIONS, PACKAGES, PACKAGE_FEATURES, PROFESSIONS, allowsAttachments, canRequestRevision, formatLKR, packagePrice, type PackageName } from "@/lib/nishflow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Stepper } from "./Stepper";
import { cn } from "@/lib/utils";

type Order = Tables<"nishflow_portfolio_orders">;

export function CustomerWorkspace({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("nishflow_portfolio_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setOrders(data ?? []);
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "nishflow_portfolio_orders", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, userId]);

  if (!orders) return <p className="text-muted-foreground">Loading…</p>;

  if (orders.length === 0 || creating)
    return (
      <OrderForm
        userId={userId}
        onDone={() => {
          setCreating(false);
          load();
        }}
        onCancel={orders.length ? () => setCreating(false) : undefined}
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setCreating(true)}>New order</Button>
      </div>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} userId={userId} onChange={load} />
      ))}
    </div>
  );
}

// ─── 2-step order form ────────────────────────────────────────────────────────

type Step = "packages" | "form";

function OrderForm({ userId, onDone, onCancel }: { userId: string; onDone: () => void; onCancel?: (() => void) | undefined }) {
  const [step, setStep] = useState<Step>("packages");
  const [selectedPkg, setSelectedPkg] = useState<PackageName | "">("");

  const [f, setF] = useState({ full_name: "", profession_type: "", designation: "", linkedin_url: "", contact_number: "", additional_requirements: "" });
  const [otherIndustry, setOtherIndustry] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [cvs, setCvs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  function choosePkg(pkg: PackageName) {
    setSelectedPkg(pkg);
    setStep("form");
    // scroll to top so the form starts at the top of the viewport
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToPackages() {
    setStep("packages");
    setSelectedPkg("");
    setFiles([]);
    setCvs([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pkg = selectedPkg;
    if (!f.profession_type || !pkg) { toast.error("Choose your industry and package."); return; }

    const industry = f.profession_type === "Other" ? otherIndustry.trim() : f.profession_type;
    if (!industry) { toast.error("Please type your industry."); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const attachments: string[] = [];
    if (allowsAttachments(pkg)) {
      for (const file of files) {
        const path = `${userId}/${id}/attachments/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("receipts").upload(path, file);
        if (up.error) { setBusy(false); toast.error(`${file.name}: ${up.error.message}`); return; }
        attachments.push(path);
      }
    }
    const cv_urls: string[] = [];
    for (const file of cvs) {
      const cvPath = `${userId}/${id}/cv-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("portfolio-cvs").upload(cvPath, file);
      if (up.error) { setBusy(false); toast.error(`${file.name}: ${up.error.message}`); return; }
      cv_urls.push(cvPath);
    }
    const { error } = await supabase.from("nishflow_portfolio_orders").insert({
      ...f,
      id,
      profession_type: industry,
      package_selected: pkg,
      price_lkr: packagePrice(pkg),
      attachments,
      cv_urls,
      user_id: userId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Details received! Next: upload your payment slip.");
    onDone();
  }

  // ── Step 1: package picker ─────────────────────────────────────────────────
  if (step === "packages") {
    return (
      <div className="space-y-8">
        {onCancel && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />Cancel
            </Button>
          </div>
        )}
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Step 1 of 2</p>
          <h2 className="text-2xl font-bold md:text-3xl">Choose your package</h2>
          <p className="text-muted-foreground text-sm">Select the plan that fits your needs. You can fill your details next.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {(Object.keys(PACKAGES) as PackageName[]).map((p) => (
            <PackageCard key={p} pkg={p} onSelect={choosePkg} />
          ))}
        </div>
      </div>
    );
  }

  // ── Step 2: order details form ─────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="panel space-y-6 p-6 md:p-8">
      {/* Back link */}
      <button
        type="button"
        onClick={backToPackages}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Packages
      </button>

      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">Step 2 of 2</p>
        <h2 className="text-2xl font-bold">Your details</h2>
      </div>

      {/* Locked package summary */}
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Selected package</p>
          <p className="font-display font-bold text-lg">{selectedPkg}</p>
        </div>
        <p className="text-neon text-xl font-bold">{formatLKR(packagePrice(selectedPkg))}</p>
      </div>

      {/* Form fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name *"><Input required value={f.full_name} onChange={(e) => set("full_name")(e.target.value)} /></Field>
        <Field label="Industry type *">
          <Select value={f.profession_type} onValueChange={set("profession_type")}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{PROFESSIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {f.profession_type === "Other" && (
          <Field label="Your industry *"><Input required value={otherIndustry} onChange={(e) => setOtherIndustry(e.target.value)} /></Field>
        )}
        <Field label="Designation *"><Input required placeholder="e.g. Senior Software Engineer" value={f.designation} onChange={(e) => set("designation")(e.target.value)} /></Field>
        <Field label="LinkedIn URL *"><Input required type="url" placeholder="https://linkedin.com/in/…" value={f.linkedin_url} onChange={(e) => set("linkedin_url")(e.target.value)} /></Field>
        <Field label="Contact number *"><Input required value={f.contact_number} onChange={(e) => set("contact_number")(e.target.value)} /></Field>
      </div>

      <Field label="Special notes / requirements">
        <Textarea rows={3} value={f.additional_requirements} onChange={(e) => set("additional_requirements")(e.target.value)} />
      </Field>

      {/* CV upload */}
      <Field label="Attach your current CV / Documents (PDF or Word)">
        <div className="space-y-2 rounded-xl border border-dashed p-4">
          <Input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => { const list = Array.from(e.target.files ?? []); setCvs((s) => [...s, ...list].slice(0, 5)); e.target.value = ""; }}
          />
          <p className="text-xs text-muted-foreground">Multiple files allowed (PDF or Word), up to 10 MB each.</p>
          {cvs.map((file, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-secondary px-3 py-1 text-sm">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setCvs((s) => s.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Field>

      {/* Extra attachments */}
      {allowsAttachments(selectedPkg) ? (
        <div className="space-y-2 rounded-xl border border-dashed p-4">
          <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments (photos, documents)</Label>
          <Input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={(e) => { const list = Array.from(e.target.files ?? []); setFiles((s) => [...s, ...list].slice(0, 10)); e.target.value = ""; }} />
          <p className="text-xs text-muted-foreground">Up to 10 files, 10 MB each.</p>
          {files.map((file, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-secondary px-3 py-1 text-sm">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setFiles((s) => s.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          Custom photo &amp; document attachments are only available in the Premium Interactive package.
        </p>
      )}

      {/* Submit */}
      <div className="pt-2">
        <Button className="w-full" size="lg" disabled={busy}>
          {busy ? "Submitting…" : "Submit details →"}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">After submitting you'll be guided to upload your payment slip.</p>
      </div>
    </form>
  );
}

// ─── Package card (Step 1) ────────────────────────────────────────────────────

function PackageCard({ pkg, onSelect }: { pkg: PackageName; onSelect: (p: PackageName) => void }) {
  return (
    <div className="panel flex flex-col p-6 md:p-8 transition hover:border-primary/40">
      <p className="font-display font-bold text-xl">{pkg}</p>
      <p className="text-neon text-2xl font-bold mt-1">{formatLKR(PACKAGES[pkg])}</p>
      <p className="text-neon mt-1 flex items-center gap-1.5 text-xs font-semibold">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
        Hosted Free on Netlify Forever — No Monthly Fees
      </p>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground flex-1">
        {PACKAGE_FEATURES[pkg].map((x) => (
          <li key={x} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {x}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onSelect(pkg)}
        className="bg-neon mt-6 w-full rounded-lg px-4 py-3 font-display text-sm font-bold text-background shadow-[0_14px_34px_-16px_var(--neon-pink)] transition hover:brightness-110 active:scale-[0.99]"
      >
        Order Now
      </button>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function OrderCard({ order, userId, onChange }: { order: Order; userId: string; onChange: () => void }) {
  const price = order.price_lkr ?? packagePrice(order.package_selected);
  return (
    <div className="panel grid gap-8 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
        <h3 className="text-xl font-bold">{order.package_selected} · {formatLKR(price)}</h3>
        <p className="mb-6 text-sm text-muted-foreground">{order.full_name} — {order.designation ? `${order.designation}, ` : ""}{order.profession_type}</p>
        <Stepper status={order.order_status} liveUrl={order.live_url} />
      </div>
      <div>
        {order.order_status === "Details Received" && <PaymentPanel order={order} userId={userId} onDone={onChange} />}
        {order.order_status === "Pending Payment Approval" && (
          <Notice tone="amber" title="Payment verification pending">We've received your slip and are verifying the transaction.</Notice>
        )}
        {order.order_status === "In Progress" && (
          <Notice tone="success" title="Payment approved">Your portfolio architecture is being built.</Notice>
        )}
        {order.order_status === "Completed" && (
          <Notice tone="success" title="Completed & shipped">
            Your portfolio is live:{" "}
            {order.live_url && <a className="underline" href={order.live_url} target="_blank" rel="noreferrer">{order.live_url}</a>}
          </Notice>
        )}
        {(order.order_status === "In Progress" || order.order_status === "Completed") && (
          <RevisionPanel order={order} onDone={onChange} />
        )}
      </div>
    </div>
  );
}

function RevisionPanel({ order, onDone }: { order: Order; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const used = order.revisions_used ?? 0;
  const remaining = Math.max(0, MAX_REVISIONS - used);
  const requested = order.revision_status === "Requested";

  async function send() {
    if (!notes.trim()) { toast.error("Please describe the changes you need"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("request_revision", { _order_id: order.id, _notes: notes });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Revision request sent");
    setOpen(false); setNotes(""); onDone();
  }

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Revisions Remaining: <span className="text-neon">{remaining} / {MAX_REVISIONS}</span></p>
        <div className="flex gap-1">
          {Array.from({ length: MAX_REVISIONS }).map((_, i) => (
            <span key={i} className={cn("h-2 w-6 rounded-full", i < used ? "bg-muted" : "bg-neon")} />
          ))}
        </div>
      </div>
      {remaining === 0 ? (
        <p className="text-sm text-success">3 of 3 Revisions Completed</p>
      ) : requested ? (
        <p className="text-sm text-amber">Revision requested — we're working on your changes.</p>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)} disabled={!canRequestRevision(order.order_status, used, order.revision_status)}>Request Revision</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request a revision</DialogTitle></DialogHeader>
          <Textarea rows={5} maxLength={2000} placeholder="Describe the changes you'd like…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button onClick={send} disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "amber" | "success" | "destructive"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4",
      tone === "amber" && "border-amber/40 bg-amber/10 text-amber",
      tone === "success" && "border-success/40 bg-success/10 text-success",
      tone === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive")}>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-foreground/80">{children}</p>
    </div>
  );
}

function PaymentPanel({ order, userId, onDone }: { order: Order; userId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    const path = `${userId}/${order.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("receipts").upload(path, file);
    if (up.error) { setBusy(false); { toast.error(up.error.message); return; } }
    const { error } = await supabase.from("nishflow_order_payments").insert({ order_id: order.id, user_id: userId, receipt_image_url: path });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Slip uploaded — verification pending.");
    setFile(null);
    onDone();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest text-primary">Phase 2 · Bank transfer</p>
      {order.rejection_reason && (
        <Notice tone="destructive" title="Payment rejected">{order.rejection_reason} — please re-upload your slip.</Notice>
      )}
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-secondary p-4 text-sm">
        {[["Bank", BANK.bank], ["Account name", BANK.accountName], ["Branch", BANK.branch], ["Account number", BANK.accountNumber]].map(([k, v]) => (
          <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition", drag ? "border-primary bg-accent" : "hover:border-primary/50")}
      >
        <UploadCloud className="h-8 w-8 text-primary" />
        <span className="text-sm">{file ? file.name : "Drag & drop your transaction slip, or click to browse"}</span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Button className="w-full" disabled={!file || busy} onClick={upload}>
        {order.rejection_reason ? "Re-upload Slip" : "Submit slip"}
      </Button>
      {!order.rejection_reason && (
        <p className="flex items-center gap-2 text-xs text-amber"><AlertTriangle className="h-3 w-3" />Awaiting your slip upload</p>
      )}
    </div>
  );
}
