import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthPanel } from "@/components/nishflow/AuthPanel";
import { CustomerWorkspace } from "@/components/nishflow/CustomerWorkspace";
import { AdminDashboard } from "@/components/nishflow/AdminDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nishflow Studio — Interactive Portfolio Solutions" },
      { name: "description", content: "Order a custom interactive portfolio from Nishflow Studio and track it from payment to launch." },
      { property: "og:title", content: "Nishflow Studio — Interactive Portfolio Solutions" },
      { property: "og:description", content: "Order a custom interactive portfolio and track it from payment to launch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return setIsAdmin(false);
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Nishflow</p>
          <h1 className="text-2xl font-bold md:text-4xl">
            <span className="text-neon">Nishflow Studio</span> — Interactive Portfolio Solutions
          </h1>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user.email}</span>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-16">
        {user === undefined ? null : !user ? (
          <AuthPanel />
        ) : isAdmin ? (
          <Tabs defaultValue="admin">
            <TabsList className="mb-6">
              <TabsTrigger value="admin">Admin operations</TabsTrigger>
              <TabsTrigger value="workspace">My workspace</TabsTrigger>
            </TabsList>
            <TabsContent value="admin"><AdminDashboard /></TabsContent>
            <TabsContent value="workspace"><CustomerWorkspace userId={user.id} /></TabsContent>
          </Tabs>
        ) : (
          <CustomerWorkspace userId={user.id} />
        )}
      </main>
    </div>
  );
}
