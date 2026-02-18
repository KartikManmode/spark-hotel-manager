import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, eachDayOfInterval, isWithinInterval, parseISO, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CalendarView = () => {
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: addDays(startDate, 13) }), [startDate]);

  useEffect(() => {
    const fetchData = async () => {
      const [roomsRes, bookingsRes] = await Promise.all([
        supabase.from("rooms").select("*").order("room_number"),
        supabase.from("bookings").select("*, guests(full_name)").in("status", ["confirmed", "checked_in"]),
      ]);
      setRooms(roomsRes.data ?? []);
      setBookings(bookingsRes.data ?? []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const getBookingForCell = (roomId: string, day: Date) => {
    return bookings.find((b) => {
      if (b.room_id !== roomId) return false;
      const checkIn = parseISO(b.check_in);
      const checkOut = parseISO(b.check_out);
      return isWithinInterval(day, { start: checkIn, end: addDays(checkOut, -1) });
    });
  };

  if (loading) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold">Calendar</h1><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Room Calendar</h1>
          <p className="text-sm text-muted-foreground">14-day timeline view</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStartDate(addDays(startDate, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(addDays(startDate, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[100px] bg-muted/50 px-3 py-2 text-left font-medium text-muted-foreground">Room</th>
              {days.map((day) => (
                <th key={day.toISOString()} className="min-w-[70px] px-1 py-2 text-center font-medium text-muted-foreground">
                  <div>{format(day, "EEE")}</div>
                  <div className="text-[10px]">{format(day, "MMM d")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className="border-b">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                  <div>{room.room_number}</div>
                  <div className="text-[10px] capitalize text-muted-foreground">{room.room_type}</div>
                </td>
                {days.map((day) => {
                  const booking = getBookingForCell(room.id, day);
                  return (
                    <td key={day.toISOString()} className="px-0.5 py-1">
                      {booking ? (
                        <div
                          className={`rounded px-1 py-0.5 text-center text-[10px] font-medium ${
                            booking.status === "checked_in"
                              ? "bg-success/20 text-success"
                              : "bg-primary/15 text-primary"
                          }`}
                          title={`${(booking.guests as any)?.full_name} (${booking.status})`}
                        >
                          {(booking.guests as any)?.full_name?.split(" ")[0] ?? "—"}
                        </div>
                      ) : (
                        <div className="h-5 rounded bg-muted/30" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rooms.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">Add rooms first to see the calendar.</div>
        )}
      </div>
    </div>
  );
};

export default CalendarView;
