import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  platform: string | null;
  mode: string;
  incoming_message: string | null;
  intent: string | null;
  tone: string | null;
  variants: { label: string; text: string }[];
  created_at: string;
};

export default function History() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("reply_history").select("*").order("created_at", { ascending: false }).limit(50);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };
  useEffect(() => { if (user) load(); }, [user]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("reply_history").delete().eq("id", id);
    load();
  };

  return (
    <div className="container max-w-4xl px-4 py-6 md:py-10">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">History</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">Your last 50 generations.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center shadow-soft">
          <p className="text-muted-foreground">Nothing yet — head to Generate to create your first reply.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 md:p-5 shadow-soft">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 rounded-full bg-secondary capitalize">{r.platform ?? "other"}</span>
                    <span className="capitalize">{r.tone}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  </div>
                  {(r.incoming_message || r.intent) && (
                    <p className="text-sm text-foreground mt-2 line-clamp-2">
                      {r.incoming_message || r.intent}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                {r.variants?.map((v, i) => {
                  const key = `${r.id}-${i}`;
                  return (
                    <div key={i} className="p-3 rounded-lg bg-secondary/60 border border-border text-sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                        <button onClick={() => copy(v.text, key)} className="text-muted-foreground hover:text-foreground">
                          {copiedKey === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="line-clamp-4 leading-relaxed">{v.text}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
