import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Plus, Receipt, Download, CheckSquare } from "lucide-react";

const Checkout = () => {
  const { toast } = useToast();
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Checkbox selection for group checkout
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutGstin, setCheckoutGstin] = useState("");
  const [checkoutCompany, setCheckoutCompany] = useState("");
  const [checkoutPayMode, setCheckoutPayMode] = useState("cash");
  const [checkingOut, setCheckingOut] = useState(false);

  // Charge form
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeCategory, setChargeCategory] = useState("room");

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  useEffect(() => {
    fetchActiveBookings();
  }, []);

  const fetchActiveBookings = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("*, guests(full_name, email), rooms(room_number)")
      .eq("status", "checked_in")
      .order("check_out");
    setActiveBookings(data ?? []);
    setLoading(false);
  };

  const selectBooking = async (booking: any) => {
    setSelectedBooking(booking);
    const [chargesRes, paymentsRes] = await Promise.all([
      supabase.from("charges").select("*").eq("booking_id", booking.id).order("charged_at"),
      supabase.from("payments").select("*").eq("booking_id", booking.id).order("paid_at"),
    ]);
    setCharges(chargesRes.data ?? []);
    setPayments(paymentsRes.data ?? []);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    const { error } = await supabase.from("charges").insert({
      booking_id: selectedBooking.id,
      description: chargeDesc,
      amount: parseFloat(chargeAmount),
      category: chargeCategory,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Charge added" });
      setChargeDesc(""); setChargeAmount("");
      selectBooking(selectedBooking);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    const { error } = await supabase.from("payments").insert({
      booking_id: selectedBooking.id,
      amount: parseFloat(payAmount),
      method: payMethod as any,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment recorded" });
      setPayAmount("");
      selectBooking(selectedBooking);
    }
  };

  const handleGroupCheckout = async () => {
    if (selectedIds.size === 0) return;
    setCheckingOut(true);

    try {
      const bookingIds = Array.from(selectedIds);

      // Validate same guest
      const selectedBookings = activeBookings.filter((b) => selectedIds.has(b.id));
      const guestIds = new Set(selectedBookings.map((b) => b.guest_id));
      if (guestIds.size > 1) {
        toast({ title: "Error", description: "All selected bookings must belong to the same guest.", variant: "destructive" });
        setCheckingOut(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("checkout-invoice", {
        body: {
          bookingIds,
          recipientGstin: checkoutGstin || null,
          companyName: checkoutCompany || null,
          paymentMode: checkoutPayMode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Download invoice HTML as file
      if (data?.html) {
        const blob = new Blob([data.html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.invoice?.invoice_number || "invoice"}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Checkout complete",
        description: `Invoice ${data.invoice?.invoice_number} generated.${data.invoice?.email_sent ? " Email sent." : ""}`,
      });

      setCheckoutModalOpen(false);
      setSelectedIds(new Set());
      setCheckoutGstin("");
      setCheckoutCompany("");
      setCheckoutPayMode("cash");
      setSelectedBooking(null);
      fetchActiveBookings();
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  const totalCharges = charges.reduce((s, c) => s + Number(c.amount), 0) + Number(selectedBooking?.total_amount ?? 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  if (loading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Checkout</h1><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checkout & Billing</h1>
          <p className="text-sm text-muted-foreground">Manage charges, payments, and guest checkout</p>
        </div>
        {selectedIds.size > 0 && (
          <Button onClick={() => setCheckoutModalOpen(true)}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Checkout Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active bookings list with checkboxes */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Active Stays</h2></div>
          {activeBookings.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No active stays</div>
          ) : (
            <div className="divide-y">
              {activeBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <Checkbox
                    checked={selectedIds.has(b.id)}
                    onCheckedChange={() => toggleSelect(b.id)}
                  />
                  <button
                    onClick={() => selectBooking(b)}
                    className={`flex-1 text-left transition-colors rounded-lg px-2 py-1 hover:bg-muted/50 ${selectedBooking?.id === b.id ? "bg-primary/5" : ""}`}
                  >
                    <p className="font-medium">{(b.guests as any)?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Room {(b.rooms as any)?.room_number} · Out: {b.check_out}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Billing details */}
        {selectedBooking ? (
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-4">
                {(selectedBooking.guests as any)?.full_name} — Room {(selectedBooking.rooms as any)?.room_number}
              </h3>

              {/* Charges */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Charges</h4>
                  <Dialog>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="mr-1 h-3 w-3" /> Add</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Charge</DialogTitle></DialogHeader>
                      <form onSubmit={addCharge} className="space-y-4">
                        <div className="space-y-2"><Label>Description</Label><Input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} required /></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} min="0" step="0.01" required /></div>
                          <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={chargeCategory} onValueChange={setChargeCategory}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="room">Room</SelectItem>
                                <SelectItem value="food">Food & Beverage</SelectItem>
                                <SelectItem value="minibar">Minibar</SelectItem>
                                <SelectItem value="laundry">Laundry</SelectItem>
                                <SelectItem value="spa">Spa</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button type="submit" className="w-full">Add Charge</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="rounded-lg border divide-y text-sm">
                  <div className="flex justify-between px-4 py-2 bg-muted/30">
                    <span>Room charge</span>
                    <span className="font-mono">₹{Number(selectedBooking.total_amount).toFixed(2)}</span>
                  </div>
                  {charges.map((c) => (
                    <div key={c.id} className="flex justify-between px-4 py-2">
                      <span>{c.description} <span className="text-xs text-muted-foreground">({c.category})</span></span>
                      <span className="font-mono">₹{Number(c.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payments */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Payments</h4>
                  <Dialog>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><CreditCard className="mr-1 h-3 w-3" /> Record Payment</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
                      <form onSubmit={addPayment} className="space-y-4">
                        <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} min="0" step="0.01" required /></div>
                        <div className="space-y-2">
                          <Label>Method</Label>
                          <Select value={payMethod} onValueChange={setPayMethod}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="credit_card">Credit Card</SelectItem>
                              <SelectItem value="debit_card">Debit Card</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="online">Online</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="submit" className="w-full">Record Payment</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="rounded-lg border divide-y text-sm">
                  {payments.length === 0 ? (
                    <div className="px-4 py-2 text-muted-foreground">No payments recorded</div>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="flex justify-between px-4 py-2">
                        <span className="capitalize">{p.method.replace("_", " ")}</span>
                        <span className="font-mono text-success">-₹{Number(p.amount).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <div className="flex justify-between text-sm"><span>Total Charges</span><span className="font-mono font-semibold">₹{totalCharges.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span>Total Paid</span><span className="font-mono text-success">₹{totalPaid.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t pt-1">
                  <span>Balance</span>
                  <span className={`font-mono ${balance > 0 ? "text-destructive" : "text-success"}`}>₹{balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center rounded-xl border bg-card p-12 text-muted-foreground">
            Select an active stay to manage billing, or check bookings to group checkout
          </div>
        )}
      </div>

      {/* Group Checkout Modal */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout — {selectedIds.size} Booking(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium mb-1">Selected Rooms:</p>
              {activeBookings
                .filter((b) => selectedIds.has(b.id))
                .map((b) => (
                  <p key={b.id} className="text-muted-foreground">
                    Room {(b.rooms as any)?.room_number} — {(b.guests as any)?.full_name}
                  </p>
                ))}
            </div>
            <div className="space-y-2">
              <Label>Recipient GSTIN (optional)</Label>
              <Input value={checkoutGstin} onChange={(e) => setCheckoutGstin(e.target.value)} placeholder="e.g. 27XXXXX1234X1Z5" />
            </div>
            <div className="space-y-2">
              <Label>Company Name (optional)</Label>
              <Input value={checkoutCompany} onChange={(e) => setCheckoutCompany(e.target.value)} placeholder="Company name for invoice" />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={checkoutPayMode} onValueChange={setCheckoutPayMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="debit_card">Debit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutModalOpen(false)}>Cancel</Button>
            <Button onClick={handleGroupCheckout} disabled={checkingOut}>
              <Receipt className="mr-2 h-4 w-4" />
              {checkingOut ? "Processing..." : "Finalize Checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Checkout;
