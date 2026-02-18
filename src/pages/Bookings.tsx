import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";
import { format, differenceInDays } from "date-fns";

const Bookings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedGuest, setSelectedGuest] = useState("");
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const [isNewGuest, setIsNewGuest] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBookings();
    fetchGuests();
  }, []);

  const fetchBookings = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("*, guests(full_name), rooms(room_number, room_type, rate_per_night)")
      .order("created_at", { ascending: false });
    setBookings(data ?? []);
    setLoading(false);
  };

  const fetchGuests = async () => {
    const { data } = await supabase.from("guests").select("*").order("full_name");
    setGuests(data ?? []);
  };

  const searchAvailability = async () => {
    if (!checkIn || !checkOut) return;
    setSearching(true);
    const { data, error } = await supabase.rpc("get_available_rooms", {
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAvailableRooms(data ?? []);
    }
    setSearching(false);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut || !selectedRoom) return;
    setSubmitting(true);

    try {
      let guestId = selectedGuest;

      if (isNewGuest) {
        if (!newGuestName.trim()) throw new Error("Guest name is required");
        const { data: newGuest, error: guestError } = await supabase
          .from("guests")
          .insert({ full_name: newGuestName.trim(), email: newGuestEmail || null, phone: newGuestPhone || null })
          .select()
          .single();
        if (guestError) throw guestError;
        guestId = newGuest.id;
      }

      if (!guestId) throw new Error("Please select or create a guest");

      const room = availableRooms.find((r) => r.id === selectedRoom);
      const nights = differenceInDays(new Date(checkOut), new Date(checkIn));
      const totalAmount = room ? Number(room.rate_per_night) * nights : 0;

      const { error } = await supabase.from("bookings").insert({
        guest_id: guestId,
        room_id: selectedRoom,
        check_in: checkIn,
        check_out: checkOut,
        total_amount: totalAmount,
        status: "confirmed",
        created_by: user?.id,
      });

      if (error) throw error;

      toast({ title: "Booking created", description: `Reservation confirmed for ${nights} night(s).` });
      setDialogOpen(false);
      resetForm();
      fetchBookings();
    } catch (error: any) {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCheckIn("");
    setCheckOut("");
    setSelectedRoom("");
    setSelectedGuest("");
    setNewGuestName("");
    setNewGuestEmail("");
    setNewGuestPhone("");
    setAvailableRooms([]);
    setIsNewGuest(false);
  };

  const handleCheckIn = async (bookingId: string, roomId: string) => {
    const { error } = await supabase.from("bookings").update({ status: "checked_in" }).eq("id", bookingId);
    if (!error) {
      await supabase.from("rooms").update({ status: "occupied" }).eq("id", roomId);
      toast({ title: "Guest checked in" });
      fetchBookings();
    }
  };

  const handleCancel = async (bookingId: string) => {
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
    if (!error) {
      toast({ title: "Booking cancelled" });
      fetchBookings();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Booking Engine</h1>
          <p className="text-sm text-muted-foreground">Create and manage reservations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Booking</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Reservation</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} min={checkIn} required />
                </div>
              </div>

              <Button type="button" variant="secondary" onClick={searchAvailability} disabled={!checkIn || !checkOut || searching} className="w-full">
                <Search className="mr-2 h-4 w-4" /> {searching ? "Searching..." : "Search Availability"}
              </Button>

              {availableRooms.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Room ({availableRooms.length} available)</Label>
                  <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                    <SelectTrigger><SelectValue placeholder="Choose a room" /></SelectTrigger>
                    <SelectContent>
                      {availableRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.room_number} — {room.room_type} — ${Number(room.rate_per_night).toFixed(0)}/night
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Guest</Label>
                  <button type="button" onClick={() => setIsNewGuest(!isNewGuest)} className="text-xs text-primary hover:underline">
                    {isNewGuest ? "Select existing" : "New guest"}
                  </button>
                </div>
                {isNewGuest ? (
                  <div className="space-y-2">
                    <Input placeholder="Full name *" value={newGuestName} onChange={(e) => setNewGuestName(e.target.value)} required />
                    <Input type="email" placeholder="Email" value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} />
                    <Input placeholder="Phone" value={newGuestPhone} onChange={(e) => setNewGuestPhone(e.target.value)} />
                  </div>
                ) : (
                  <Select value={selectedGuest} onValueChange={setSelectedGuest}>
                    <SelectTrigger><SelectValue placeholder="Select guest" /></SelectTrigger>
                    <SelectContent>
                      {guests.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedRoom && checkIn && checkOut && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">Booking Summary</p>
                  <p className="text-muted-foreground">
                    {differenceInDays(new Date(checkOut), new Date(checkIn))} night(s) ·{" "}
                    ${(Number(availableRooms.find((r) => r.id === selectedRoom)?.rate_per_night ?? 0) * differenceInDays(new Date(checkOut), new Date(checkIn))).toFixed(2)}
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || !selectedRoom}>
                {submitting ? "Creating..." : "Confirm Reservation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border bg-card">
        {bookings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No bookings yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Guest</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Room</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Dates</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-b data-table-row">
                    <td className="px-5 py-3 font-medium">{(b.guests as any)?.full_name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{(b.rooms as any)?.room_number}</td>
                    <td className="px-5 py-3 text-xs">{b.check_in} → {b.check_out}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-5 py-3 font-mono">${Number(b.total_amount).toFixed(2)}</td>
                    <td className="px-5 py-3 space-x-2">
                      {b.status === "confirmed" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleCheckIn(b.id, b.room_id)}>Check In</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancel(b.id)}>Cancel</Button>
                        </>
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

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    confirmed: "bg-primary/10 text-primary",
    checked_in: "bg-success/10 text-success",
    checked_out: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
    no_show: "bg-warning/10 text-warning",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}>
      {status.replace("_", " ")}
    </span>
  );
};

export default Bookings;
