import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { formatLKR, packagePrice } from "@/lib/nishflow";
import { cn } from "@/lib/utils";

type Order = Tables<"nishflow_portfolio_orders"> & { payments: Tables<"nishflow_order_payments">[] };

export function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("nishflow_portfolio_orders")
      .select("*, payments:nishflow_order_payments(*)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setOrders((data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "nishflow_portfolio_orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "nishflow_order_payments" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const revenue = orders.filter((o) => ["In Progress", "Completed"].includes(o.order_status))
    .reduce((s, o) => s + (o.price_lkr ?? packagePrice(o.package_selected)), 0);
  const metrics = [
    ["Total orders", orders.length],
    ["Awaiting verification", orders.filter((o) => o.order_status === "Pending Payment Approval").length],
    ["In progress", orders.filter((o) => o.order_status === "In Progress").length],
    ["Confirmed revenue", formatLKR(revenue)],
  ];

  async function openSlip(path: string) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
    if (error) { toast.error(error.message); return; }
    setPreview(data.signedUrl);
  }

  async function downloadCv(path: string) {
    const { data, error } = await supabase.storage.from("portfolio-cvs").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    const res = await fetch(data.signedUrl);
    if (!res.ok) { toast.error("Could not fetch the CV file."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "cv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {metrics.map(([k, v]) => (
          <div key={k as string} className="panel p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{k}</p>
            <p className="font-display text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      {orders.length === 0 && <p className="text-muted-foreground">No orders yet.</p>}
      {orders.map((o) => <AdminRow key={o.id} order={o} onSlip={openSlip} onCv={downloadCv} onChange={load} />)}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Payment receipt</DialogTitle></DialogHeader>
          {preview && <img src={preview} alt="Payment slip" className="max-h-[70vh] w-full rounded-lg object-contain" />}
          {preview && <a href={preview} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open in new tab</a>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminRow({ order, onSlip, onCv, onChange }: { order: Order; onSlip: (p: string) => void; onCv: (p: string) => void; onChange: () => void }) {
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState(order.live_url ?? "");
  const latest = [...order.payments].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];
  const pending = latest?.payment_status === "Pending Verification";

  async function approve() {
    if (!latest) return;
    const { error } = await supabase.from("nishflow_order_payments").update({ payment_status: "Approved" }).eq("id", latest.id);
    error ? toast.error(error.message) : toast.success("Payment approved");
    onChange();
  }
  async function reject() {
    if (!latest) return;
    if (!reason.trim()) { toast.error("Add a rejection note."); return; }
    const a = await supabase.from("nishflow_order_payments").update({ payment_status: "Rejected" }).eq("id", latest.id);
    const b = await supabase.from("nishflow_portfolio_orders").update({ order_status: "Details Received", rejection_reason: reason.trim() }).eq("id", order.id);
    if (a.error || b.error) toast.error((a.error ?? b.error)!.message); else toast.success("Payment rejected");
    setReason("");
    onChange();
  }
  async function complete() {
    let link = url.trim();
    if (!link) { toast.error("Paste the live URL first."); return; }
    if (!/^https?:\/\//.test(link)) link = `https://${link}`;
    const { error } = await supabase.from("nishflow_portfolio_orders").update({ order_status: "Completed", live_url: link }).eq("id", order.id);
    error ? toast.error(error.message) : toast.success("Marked completed");
    onChange();
  }

  async function closeRevision() {
    const link = url.trim() && !/^https?:\/\//.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    const { error } = await supabase.rpc("close_revision", { _order_id: order.id, _live_url: link });
    if (error) { toast.error(error.message); return; }
    toast.success("Revision closed");
    onChange();
  }

  const statusTone = order.order_status === "Completed" || order.order_status === "In Progress"
    ? "border-success/40 text-success" : order.order_status === "Pending Payment Approval" ? "border-amber/40 text-amber" : "text-muted-foreground";

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">{order.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {order.designation ? `${order.designation} · ` : ""}{order.profession_type} · {order.package_selected} ({formatLKR(order.price_lkr ?? packagePrice(order.package_selected))})
          </p>
        </div>
        <Badge variant="outline" className={cn(statusTone)}>{order.order_status}</Badge>
      </div>

      <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Customer Details</p>
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p><span className="text-muted-foreground">Phone Number: </span><span className="font-medium">{order.contact_number || "—"}</span></p>
          <p><span className="text-muted-foreground">Designation: </span>{order.designation || "—"}</p>
          <p><span className="text-muted-foreground">Industry: </span>{order.profession_type}</p>
        </div>
        {order.linkedin_url && <a href={order.linkedin_url} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline">LinkedIn profile</a>}
        {order.cv_urls && order.cv_urls.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {order.cv_urls.map((p, i) => (
              <Button key={p} size="sm" className="gap-2" onClick={() => onCv(p)}>
                <Download className="h-4 w-4" /> Download CV / Document{order.cv_urls.length > 1 ? ` (${i + 1})` : ""}
              </Button>
            ))}
          </div>
        )}
        {order.attachments && order.attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm text-muted-foreground">Attached CV / Documents:</span>
            {order.attachments.map((a, i) => (
              <Button key={a} size="sm" variant="secondary" onClick={() => onSlip(a)}>
                Download / View {order.attachments.length > 1 ? `(${i + 1})` : ""}
              </Button>
            ))}
          </div>
        )}
      </div>

      {order.additional_requirements && (
        <div className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber">Customer Notes &amp; Requirements</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{order.additional_requirements}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {latest ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onSlip(latest.receipt_image_url)}>View receipt slip</Button>
            <span className="text-muted-foreground">Payment: {latest.payment_status} · {new Date(latest.uploaded_at).toLocaleString()}</span>
          </>
        ) : <span className="text-muted-foreground">No slip uploaded yet</span>}
      </div>
      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90" onClick={approve}>Approve Payment</Button>
          <Input className="max-w-xs" placeholder="Rejection note" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" onClick={reject}>Reject Payment</Button>
        </div>
      )}
      {(order.order_status === "In Progress" || order.order_status === "Completed") && (
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-sm" placeholder="name.netlify.app" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" onClick={complete}>Mark Completed</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Revisions used: {order.revisions_used} / 3</p>
      {order.revision_status === "Requested" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <Badge className="bg-destructive text-destructive-foreground animate-pulse">Revision Requested</Badge>
          <p className="whitespace-pre-wrap text-sm">{order.revision_notes}</p>
          <Button size="sm" onClick={closeRevision}>Apply Changes &amp; Close Revision</Button>
          <p className="text-xs text-muted-foreground">Uses the live link above if you changed it.</p>
        </div>
      )}
    </div>
  );
}
