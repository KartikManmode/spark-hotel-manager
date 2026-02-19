import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";

const Guests = () => {
  const { toast } = useToast();
  const [guests, setGuests] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");

  useEffect(() => { fetchGuests(); }, []);

  const fetchGuests = async () => {
    const { data } = await supabase.from("guests").select("*").order("created_at", { ascending: false });
    setGuests(data ?? []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("guests").insert({
      full_name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      id_type: idType || null,
      id_number: idNumber || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Guest added" });
      setDialogOpen(false);
      setName(""); setEmail(""); setPhone(""); setIdType(""); setIdNumber("");
      fetchGuests();
    }
  };

  const filtered = guests.filter((g) =>
    g.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (g.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Guests</h1><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Guest Directory</h1>
          <p className="text-sm text-muted-foreground">{guests.length} registered guests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Guest</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Register Guest</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Full Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Phone *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>ID Type</Label><Input value={idType} onChange={(e) => setIdType(e.target.value)} placeholder="Passport, DL..." /></div>
                <div className="space-y-2"><Label>ID Number</Label><Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></div>
              </div>
              <Button type="submit" className="w-full">Register Guest</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search guests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-xl border bg-card">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No guests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Visits</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id} className="border-b data-table-row">
                    <td className="px-5 py-3 font-medium">{g.full_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{g.email || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{g.phone || "—"}</td>
                    <td className="px-5 py-3 font-mono">{g.total_visits}</td>
                    <td className="px-5 py-3 font-mono">₹{Number(g.total_spent).toFixed(2)}</td>
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

export default Guests;
