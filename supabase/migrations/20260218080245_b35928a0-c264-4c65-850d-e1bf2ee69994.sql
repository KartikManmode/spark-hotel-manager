
-- Enable btree_gist extension for EXCLUDE constraints with tsrange
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Room status enum (state machine)
CREATE TYPE public.room_status AS ENUM (
  'available', 'reserved', 'occupied', 'needs_service', 'under_cleaning'
);

-- Room type enum
CREATE TYPE public.room_type AS ENUM (
  'standard', 'deluxe', 'suite', 'presidential'
);

-- Booking status enum
CREATE TYPE public.booking_status AS ENUM (
  'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

-- Payment method enum
CREATE TYPE public.payment_method AS ENUM (
  'cash', 'credit_card', 'debit_card', 'bank_transfer', 'online'
);

-- Staff profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL UNIQUE,
  room_type public.room_type NOT NULL DEFAULT 'standard',
  floor INTEGER NOT NULL DEFAULT 1,
  rate_per_night NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.room_status NOT NULL DEFAULT 'available',
  amenities TEXT[] DEFAULT '{}',
  max_occupancy INTEGER NOT NULL DEFAULT 2,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view rooms" ON public.rooms FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage rooms" ON public.rooms FOR ALL USING (auth.uid() IS NOT NULL);

-- Guests
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  id_type TEXT,
  id_number TEXT,
  nationality TEXT,
  address TEXT,
  notes TEXT DEFAULT '',
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view guests" ON public.guests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage guests" ON public.guests FOR ALL USING (auth.uid() IS NOT NULL);

-- Bookings with EXCLUDE constraint to prevent double booking
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES public.guests(id),
  room_id UUID NOT NULL REFERENCES public.rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_dates CHECK (check_out > check_in),
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'))
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view bookings" ON public.bookings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage bookings" ON public.bookings FOR ALL USING (auth.uid() IS NOT NULL);

-- Charges
CREATE TABLE public.charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'room',
  charged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view charges" ON public.charges FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage charges" ON public.charges FOR ALL USING (auth.uid() IS NOT NULL);

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view payments" ON public.payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage payments" ON public.payments FOR ALL USING (auth.uid() IS NOT NULL);

-- Service logs
CREATE TABLE public.service_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id),
  room_id UUID NOT NULL REFERENCES public.rooms(id),
  service_type TEXT NOT NULL,
  description TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view service_logs" ON public.service_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage service_logs" ON public.service_logs FOR ALL USING (auth.uid() IS NOT NULL);

-- Inventory
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  min_stock INTEGER NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_restocked TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view inventory" ON public.inventory_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage inventory" ON public.inventory_items FOR ALL USING (auth.uid() IS NOT NULL);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_guests_updated_at BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check room availability
CREATE OR REPLACE FUNCTION public.check_room_availability(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE room_id = p_room_id
      AND status NOT IN ('cancelled', 'no_show')
      AND daterange(check_in, check_out) && daterange(p_check_in, p_check_out)
      AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get available rooms for date range
CREATE OR REPLACE FUNCTION public.get_available_rooms(
  p_check_in DATE,
  p_check_out DATE
)
RETURNS SETOF public.rooms AS $$
BEGIN
  RETURN QUERY
  SELECT r.* FROM public.rooms r
  WHERE r.id NOT IN (
    SELECT b.room_id FROM public.bookings b
    WHERE b.status NOT IN ('cancelled', 'no_show')
      AND daterange(b.check_in, b.check_out) && daterange(p_check_in, p_check_out)
  )
  ORDER BY r.room_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable realtime for bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
