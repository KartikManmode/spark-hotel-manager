import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "@/components/StatCard";
import { BedDouble, Users, CalendarCheck, DollarSign, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { format } from "date-fns";

interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  todayArrivals: number;
  todayDepartures: number;
  totalGuests: number;
  revenue: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalRooms: 0,
    occupiedRooms: 0,
    todayArrivals: 0,
    todayDepartures: 0,
    totalGuests: 0,
    revenue: 0,
  });
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    const fetchData = async () => {
      const [roomsRes, occupiedRes, arrivalsRes, departuresRes, guestsRes, revenueRes, recentRes] = await Promise.all([
        supabase.from("rooms").select("id", { count: "exact", head: true }),
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("status", "occupied"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("check_in", today).in("status", ["confirmed", "checked_in"]),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("check_out", today).eq("status", "checked_in"),
        supabase.from("guests").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount"),
        supabase.from("bookings").select("*, guests(full_name), rooms(room_number)").order("created_at", { ascending: false }).limit(5),
      ]);

      const totalRevenue = revenueRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

      setStats({
        totalRooms: roomsRes.count ?? 0,
        occupiedRooms: occupiedRes.count ?? 0,
        todayArrivals: arrivalsRes.count ?? 0,
        todayDepartures: departuresRes.count ?? 0,
        totalGuests: guestsRes.count ?? 0,
        revenue: totalRevenue,
      });
      setRecentBookings(recentRes.data ?? []);
      setLoading(false);
    };

    fetchData();
  }, [today]);

  const occupancyRate = stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Occupancy Rate"
          value={`${occupancyRate}%`}
          subtitle={`${stats.occupiedRooms} of ${stats.totalRooms} rooms`}
          icon={<BedDouble className="h-5 w-5" />}
        />
        <StatCard
          title="Today's Arrivals"
          value={stats.todayArrivals}
          subtitle="Expected check-ins"
          icon={<ArrowDownToLine className="h-5 w-5" />}
        />
        <StatCard
          title="Today's Departures"
          value={stats.todayDepartures}
          subtitle="Expected check-outs"
          icon={<ArrowUpFromLine className="h-5 w-5" />}
        />
        <StatCard
          title="Total Revenue"
          value={`$${stats.revenue.toLocaleString()}`}
          subtitle="All time"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Total Guests"
          value={stats.totalGuests}
          subtitle="Registered guests"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Active Bookings"
          value={recentBookings.length}
          subtitle="Recent reservations"
          icon={<CalendarCheck className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Recent Bookings</h2>
        </div>
        {recentBookings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No bookings yet. Create your first booking to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Guest</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Room</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Check-in</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Check-out</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id} className="border-b data-table-row">
                    <td className="px-5 py-3 font-medium">{(b.guests as any)?.full_name ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs">{(b.rooms as any)?.room_number ?? "—"}</td>
                    <td className="px-5 py-3">{b.check_in}</td>
                    <td className="px-5 py-3">{b.check_out}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-5 py-3 font-mono">${Number(b.total_amount).toFixed(2)}</td>
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
};

export default Dashboard;
