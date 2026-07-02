import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { formatINR, formatDate } from "@/lib/format";
import { Plus, Search, Loader2, FileText } from "lucide-react";
import type { Quotation, QuoteStatus } from "@/types";
import { cn } from "@/lib/utils";

const filters: { value: QuoteStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

export default function Quotations() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quotation[];
    },
  });

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const matchesFilter = filter === "all" || q.status === filter;
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        q.client_name.toLowerCase().includes(term) ||
        q.project_title.toLowerCase().includes(term) ||
        String(q.quote_number).includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [quotes, filter, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search quotes…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button asChild className="gap-2">
          <Link to="/quotations/new">
            <Plus className="h-4 w-4" /> New quotation
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {quotes.length === 0
                ? "No quotations yet. Create your first quote with the calculator."
                : "Nothing matches your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((quote) => (
            <Link key={quote.id} to={`/quotations/${quote.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <span className="text-muted-foreground">#{quote.quote_number}</span>{" "}
                      {quote.project_title || "Untitled project"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {quote.client_name || "No client"} · {formatDate(quote.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-semibold">{formatINR(quote.total)}</p>
                    <StatusBadge status={quote.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
