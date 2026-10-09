CREATE POLICY "Public can update orders"
    ON public.store_orders
    FOR UPDATE
    USING (true);
