import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, AlertTriangle } from "lucide-react";

const Inventory = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("housekeeping");
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState("pcs");
  const [minStock, setMinStock] = useState("0");
  const [costPerUnit, setCostPerUnit] = useState("0");

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    const { data } = await supabase.from("inventory_items").select("*").order("category", { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("inventory_items").insert({
      name, category, quantity: parseInt(quantity), unit, min_stock: parseInt(minStock), cost_per_unit: parseFloat(costPerUnit),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item added" });
      setDialogOpen(false);
      setName(""); setQuantity("0"); setCostPerUnit("0");
      fetchItems();
    }
  };

  const updateQuantity = async (id: string, delta: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    await supabase.from("inventory_items").update({ quantity: newQty }).eq("id", id);
    fetchItems();
  };

  if (loading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Inventory</h1><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }

  const lowStock = items.filter((i) => i.quantity <= i.min_stock);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">{items.length} items tracked{lowStock.length > 0 ? ` · ${lowStock.length} low stock` : ""}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
                <div className="space-y-2"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, liters..." /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" /></div>
                <div className="space-y-2"><Label>Min Stock</Label><Input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} min="0" /></div>
                <div className="space-y-2"><Label>Cost/Unit</Label><Input type="number" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} min="0" step="0.01" /></div>
              </div>
              <Button type="submit" className="w-full">Add Item</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{lowStock.length} item(s) below minimum stock level</span>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        {items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No inventory items.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Item</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Stock</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Min</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Cost/Unit</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={`border-b data-table-row ${item.quantity <= item.min_stock ? "bg-warning/5" : ""}`}>
                    <td className="px-5 py-3 font-medium">
                      {item.name}
                      {item.quantity <= item.min_stock && <AlertTriangle className="ml-1 inline h-3 w-3 text-warning" />}
                    </td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">{item.category}</td>
                    <td className="px-5 py-3 font-mono">{item.quantity} {item.unit}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{item.min_stock}</td>
                    <td className="px-5 py-3 font-mono">${Number(item.cost_per_unit).toFixed(2)}</td>
                    <td className="px-5 py-3 space-x-1">
                      <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, -1)}>−</Button>
                      <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, 1)}>+</Button>
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

export default Inventory;
