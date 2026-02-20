
-- Invoice counter for sequential numbering (single row)
CREATE TABLE public.invoice_counter (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  current_number integer NOT NULL DEFAULT 0
);

-- Seed the counter
INSERT INTO public.invoice_counter (id, year, current_number) VALUES (1, EXTRACT(YEAR FROM now())::integer, 0);

-- Enable RLS
ALTER TABLE public.invoice_counter ENABLE ROW LEVEL SECURITY;

-- Only backend (service role) should modify this; authenticated can read
CREATE POLICY "Authenticated users can view invoice_counter"
  ON public.invoice_counter FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Invoices table (immutable after creation)
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL UNIQUE,
  guest_id uuid NOT NULL REFERENCES public.guests(id),
  recipient_gstin text,
  recipient_company_name text,
  base_amount numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_mode text NOT NULL DEFAULT 'cash',
  pdf_url text,
  email_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No update/delete policies - invoices are immutable from frontend
-- Only service role (edge function) can insert

-- Invoice items
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  room_number text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invoice_items"
  ON public.invoice_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true);

CREATE POLICY "Authenticated users can read invoice PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND auth.uid() IS NOT NULL);

CREATE POLICY "Service role can upload invoice PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices');

-- DB function for atomic invoice creation
CREATE OR REPLACE FUNCTION public.finalize_checkout(
  p_booking_ids uuid[],
  p_recipient_gstin text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_payment_mode text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guest_id uuid;
  v_guest_name text;
  v_guest_email text;
  v_booking record;
  v_base_amount numeric := 0;
  v_cgst numeric;
  v_sgst numeric;
  v_total numeric;
  v_year integer;
  v_next_number integer;
  v_invoice_number text;
  v_invoice_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_room_charges numeric;
  v_extra_charges numeric;
BEGIN
  -- Validate all bookings belong to same guest and are checked_in
  SELECT DISTINCT guest_id INTO v_guest_id
  FROM bookings
  WHERE id = ANY(p_booking_ids);

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'No valid bookings found';
  END IF;

  -- Check single guest
  IF (SELECT COUNT(DISTINCT guest_id) FROM bookings WHERE id = ANY(p_booking_ids)) > 1 THEN
    RAISE EXCEPTION 'All bookings must belong to the same guest';
  END IF;

  -- Check none are already checked_out
  IF EXISTS (SELECT 1 FROM bookings WHERE id = ANY(p_booking_ids) AND status NOT IN ('checked_in')) THEN
    RAISE EXCEPTION 'All bookings must be in checked_in status';
  END IF;

  -- Get guest info
  SELECT full_name, email INTO v_guest_name, v_guest_email
  FROM guests WHERE id = v_guest_id;

  -- Calculate totals from bookings and charges
  FOR v_booking IN
    SELECT b.id, b.total_amount, b.check_in, b.check_out, b.room_id,
           r.room_number, r.room_type
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE b.id = ANY(p_booking_ids)
  LOOP
    v_room_charges := v_booking.total_amount;
    
    SELECT COALESCE(SUM(amount), 0) INTO v_extra_charges
    FROM charges WHERE booking_id = v_booking.id;

    v_base_amount := v_base_amount + v_room_charges + v_extra_charges;

    v_items := v_items || jsonb_build_object(
      'booking_id', v_booking.id,
      'room_number', v_booking.room_number,
      'description', format('Room %s (%s) %s to %s + extras',
        v_booking.room_number, v_booking.room_type,
        v_booking.check_in, v_booking.check_out),
      'amount', v_room_charges + v_extra_charges
    );
  END LOOP;

  -- GST calculation
  v_cgst := ROUND(v_base_amount * 0.025, 2);
  v_sgst := ROUND(v_base_amount * 0.025, 2);
  v_total := v_base_amount + v_cgst + v_sgst;

  -- Lock and increment invoice counter
  v_year := EXTRACT(YEAR FROM now())::integer;

  UPDATE invoice_counter
  SET current_number = CASE WHEN year = v_year THEN current_number + 1 ELSE 1 END,
      year = v_year
  WHERE id = 1
  RETURNING current_number INTO v_next_number;

  v_invoice_number := format('INV-%s-%s', v_year, LPAD(v_next_number::text, 4, '0'));

  -- Insert invoice
  INSERT INTO invoices (invoice_number, guest_id, recipient_gstin, recipient_company_name,
    base_amount, cgst_amount, sgst_amount, total_amount, payment_mode)
  VALUES (v_invoice_number, v_guest_id, p_recipient_gstin, p_company_name,
    v_base_amount, v_cgst, v_sgst, v_total, p_payment_mode)
  RETURNING id INTO v_invoice_id;

  -- Insert invoice items
  INSERT INTO invoice_items (invoice_id, booking_id, room_number, description, amount)
  SELECT v_invoice_id,
    (item->>'booking_id')::uuid,
    item->>'room_number',
    item->>'description',
    (item->>'amount')::numeric
  FROM jsonb_array_elements(v_items) AS item;

  -- Update bookings to checked_out
  UPDATE bookings SET status = 'checked_out' WHERE id = ANY(p_booking_ids);

  -- Update rooms to needs_service
  UPDATE rooms SET status = 'needs_service'
  WHERE id IN (SELECT room_id FROM bookings WHERE id = ANY(p_booking_ids));

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'guest_name', v_guest_name,
    'guest_email', v_guest_email,
    'base_amount', v_base_amount,
    'cgst_amount', v_cgst,
    'sgst_amount', v_sgst,
    'total_amount', v_total,
    'items', v_items,
    'recipient_gstin', p_recipient_gstin,
    'recipient_company_name', p_company_name,
    'payment_mode', p_payment_mode
  );
END;
$$;
