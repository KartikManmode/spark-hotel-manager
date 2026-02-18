import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

type RoomStatus = "available" | "reserved" | "occupied" | "needs_service" | "under_cleaning";
type RoomType = "standard" | "deluxe" | "suite" | "presidential";

const statusColors: Record<string, string> = {
  available: "bg-success/10 text-success border-success/20",
  reserved: "bg-primary/10 text-primary border-primary/20",
  occupied: "bg-warning/10 text-warning border-warning/20",
  needs_service: "bg-destructive/10 text-destructive border-destructive/20",
  under_cleaning: "bg-muted text-muted-foreground border-border",
};

const Rooms = () => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("standard");
  const [floor, setFloor] = useState("1");
  const [rate, setRate] = useState("");
  const [maxOccupancy, setMaxOccupancy] = useState("2");

  useEffect(() => {
    fetchRooms();
    const channel = supabase.channel("rooms-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => fetchRooms())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchRooms = async () => {
    const { data } = await supabase.from("rooms").select("*").order("room_number");
    setRooms(data ?? []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("rooms").insert({
      room_number: roomNumber,
      room_type: roomType,
      floor: parseInt(floor),
      rate_per_night: parseFloat(rate),
      max_occupancy: parseInt(maxOccupancy),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Room created" });
      setDialogOpen(false);
      setRoomNumber(""); setRate("");
      fetchRooms();
    }
  };

  const updateStatus = async (roomId: string, status: RoomStatus) => {
    await supabase.from("rooms").update({ status }).eq("id", roomId);
    fetchRooms();
  };

  const nextStatus: Record<string, RoomStatus> = {
    available: "reserved",
    reserved: "occupied",
    occupied: "needs_service",
    needs_service: "under_cleaning",
    under_cleaning: "available",
  };

  if (loading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Rooms</h1><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Room Management</h1>
          <p className="text-sm text-muted-foreground">{rooms.length} rooms configured</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Room</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Room</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Room Number</Label>
                  <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="101" required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={roomType} onValueChange={(v) => setRoomType(v as RoomType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="deluxe">Deluxe</SelectItem>
                      <SelectItem value="suite">Suite</SelectItem>
                      <SelectItem value="presidential">Presidential</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Floor</Label>
                  <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} min="1" required />
                </div>
                <div className="space-y-2">
                  <Label>Rate/Night ($)</Label>
                  <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} min="0" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label>Max Occupancy</Label>
                  <Input type="number" value={maxOccupancy} onChange={(e) => setMaxOccupancy(e.target.value)} min="1" required />
                </div>
              </div>
              <Button type="submit" className="w-full">Create Room</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rooms.map((room) => (
          <div key={room.id} className={`rounded-xl border p-4 ${statusColors[room.status] ?? ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold">{room.room_number}</p>
                <p className="text-xs capitalize opacity-80">{room.room_type} · Floor {room.floor}</p>
              </div>
              <span className="rounded-full bg-card/50 px-2 py-0.5 text-xs font-medium capitalize">
                {room.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">${Number(room.rate_per_night).toFixed(0)}/night</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus(room.id, nextStatus[room.status])}
                className="text-xs"
              >
                → {nextStatus[room.status]?.replace("_", " ")}
              </Button>
            </div>
          </div>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full rounded-xl border bg-card p-8 text-center text-muted-foreground">
            No rooms configured. Add your first room to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default Rooms;
