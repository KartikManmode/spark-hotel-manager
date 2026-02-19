import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "@/components/StatCard";
import { BedDouble, Users, CalendarCheck, DollarSign, ArrowDownToLine, ArrowUpFromLine, Utensils, Sparkles, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";

interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  todayArrivals: number;
  todayDepartures: number;
  totalGuests: number;
  revenue: number;
}

interface SpendingBreakdown {
  room: number;
  food: number;
  minibar: number;
  laundry: number;
  spa: number;
  other: number;
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
  const [spending, setSpending] = useState<SpendingBreakdown>({ room: 0, food: 0, minibar: 0, laundry: 0, spa: 0, other: 0 });
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    const fetchData = async () => {
      const [roomsRes, occupiedRes, arrivalsRes, departuresRes, guestsRes, revenueRes, recentRes, chargesRes] = await Promise.all([
        supabase.from("rooms").select("id", { count: "exact", head: true }),
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("status", "occupied"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("check_in", today).in("status", ["confirmed", "checked_in"]),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("check_out", today).eq("status", "checked_in"),
        supabase.from("guests").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount"),
        supabase.from("bookings").select("*, guests(full_name), rooms(room_number)").order("created_at", { ascending: false }).limit(5),
        supabase.from("charges").select("amount, category"),
      ]);

      const totalRevenue = revenueRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

      // Spending breakdown from charges + room revenue from checked-out bookings
      const breakdown: SpendingBreakdown = { room: 0, food: 0, minibar: 0, laundry: 0, spa: 0, other: 0 };
      
      // Get room revenue from completed bookings
      const { data: completedBookings } = await supabase.from("bookings").select("total_amount").eq("status", "checked_out");
      breakdown.room = completedBookings?.reduce((sum, b) => sum + Number(b.total_amount), 0) ?? 0;

      // Categorize charges
      chargesRes.data?.forEach((c) => {
        const amt = Number(c.amount);
        if (c.category === "food") breakdown.food += amt;
        else if (c.category === "minibar") breakdown.minibar += amt;
        else if (c.category === "laundry") breakdown.laundry += amt;
        else if (c.category === "spa") breakdown.spa += amt;
        else breakdown.other += amt;
      });

      setSpending(breakdown);
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
  const totalSpending = spending.room + spending.food + spending.minibar + spending.laundry + spending.spa + spending.other;

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
          value={`₹${stats.revenue.toLocaleString()}`}
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

      {/* Spending Breakdown */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Spending Breakdown</h2>
          <p className="text-xs text-muted-foreground">Revenue by category from completed stays</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <BreakdownItem label="Room Charges" amount={spending.room} total={totalSpending} icon={<BedDouble className="h-4 w-4" />} />
          <BreakdownItem label="Food & Beverage" amount={spending.food} total={totalSpending} icon={<Utensils className="h-4 w-4" />} />
          <BreakdownItem label="Minibar" amount={spending.minibar} total={totalSpending} icon={<Sparkles className="h-4 w-4" />} />
          <BreakdownItem label="Laundry" amount={spending.laundry} total={totalSpending} icon={<Sparkles className="h-4 w-4" />} />
          <BreakdownItem label="Spa" amount={spending.spa} total={totalSpending} icon={<Sparkles className="h-4 w-4" />} />
          <BreakdownItem label="Other Services" amount={spending.other} total={totalSpending} icon={<MoreHorizontal className="h-4 w-4" />} />
        </div>
        <div className="border-t px-5 py-3 flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono">₹{totalSpending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
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
                    <td className="px-5 py-3 font-mono">₹{Number(b.total_amount).toFixed(2)}</td>
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

const BreakdownItem = ({ label, amount, total, icon }: { label: string; amount: number; total: number; icon: React.ReactNode }) => {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold font-mono text-sm">₹{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
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
