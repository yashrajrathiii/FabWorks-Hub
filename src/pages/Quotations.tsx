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
  { value: "accepted", label: "Accepted" },
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
      // two-stage model: anything not accepted counts as a draft (covers legacy sent/rejected rows)
      const matchesFilter =
        filter === "all" || (filter === "draft" ? q.status !== "accepted" : q.status === filter);
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
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 md:left-4 top-1/2 h-4 w-4 md:h-5 md:w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search quotes…"
            className="pl-9 md:pl-10 md:h-11 md:text-[15px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button asChild className="gap-2 md:gap-3 md:h-11 md:px-5 md:text-[15px]">
          <Link to="/quotations/new">
            <Plus className="h-4 w-4 md:h-5 md:w-5" /> New quotation
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 md:pb-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-colors",
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
            <FileText className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground/50" />
            <p className="text-sm md:text-[15px] text-muted-foreground">
              {quotes.length === 0
                ? "No quotations yet. Create your first quote with the calculator."
                : "Nothing matches your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {filtered.map((quote) => (
            <Link key={quote.id} to={`/quotations/${quote.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 p-4 md:p-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium md:text-base md:font-bold">
                      <span className="text-muted-foreground">#{quote.quote_number}</span>{" "}
                      {quote.project_title || "Untitled project"}
                    </p>
                    <p className="truncate text-xs md:text-sm text-muted-foreground">
                      {quote.client_name || "No client"} · {formatDate(quote.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 md:gap-5">
                    <div className="text-right">
                      <p className="font-semibold md:text-base md:font-bold">{formatINR(quote.final_amount ?? quote.total)}</p>
                      {quote.final_amount != null && (
                        <p className="text-[10px] md:text-xs font-medium uppercase tracking-wide text-success">agreed</p>
                      )}
                    </div>
                    <StatusBadge status={quote.status === "accepted" ? "accepted" : "draft"} />
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
