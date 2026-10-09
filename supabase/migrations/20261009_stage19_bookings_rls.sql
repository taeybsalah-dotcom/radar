CREATE POLICY "Public can insert bookings" ON public.service_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update bookings" ON public.service_bookings FOR UPDATE USING (true);
CREATE POLICY "Public can read bookings" ON public.service_bookings FOR SELECT USING (true);
