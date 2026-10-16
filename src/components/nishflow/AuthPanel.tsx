import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AuthPanel() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
      });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="panel mx-auto max-w-md p-8">
      <h2 className="text-2xl font-bold">{mode === "in" ? "Sign in to your workspace" : "Create your account"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Order and track your interactive portfolio.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "up" && (
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
      </form>
      <button className="mt-4 text-sm text-primary hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Already registered? Sign in"}
      </button>
    </div>
  );
}
