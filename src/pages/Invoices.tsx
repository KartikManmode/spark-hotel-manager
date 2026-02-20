import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Mail, FileText } from "lucide-react";

const Invoices = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*, guests(full_name)")
      .order("created_at", { ascending: false });
    setInvoices(data ?? []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-muted-foreground">Immutable audit-safe invoice records</p>
      </div>

      <div className="rounded-xl border bg-card">
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No invoices generated yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Invoice #</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Guest</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Company</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Base</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">CGST</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">SGST</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Payment</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b">
                    <td className="px-5 py-3 font-mono text-xs font-semibold">{inv.invoice_number}</td>
                    <td className="px-5 py-3">{(inv.guests as any)?.full_name}</td>
                    <td className="px-5 py-3 text-xs">{inv.recipient_company_name || "—"}</td>
                    <td className="px-5 py-3 font-mono">₹{Number(inv.base_amount).toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono text-xs">₹{Number(inv.cgst_amount).toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono text-xs">₹{Number(inv.sgst_amount).toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono font-semibold">₹{Number(inv.total_amount).toFixed(2)}</td>
                    <td className="px-5 py-3 text-xs capitalize">{(inv.payment_mode || "").replace("_", " ")}</td>
                    <td className="px-5 py-3">
                      {inv.email_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success"><Mail className="h-3 w-3" /> Sent</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs">{new Date(inv.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-5 py-3">
                      {inv.pdf_url ? (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;
