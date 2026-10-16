ALTER TABLE public.nishflow_portfolio_orders ADD COLUMN cv_url text;

CREATE POLICY "Users upload own CV"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portfolio-cvs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own CV"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'portfolio-cvs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins read all CVs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'portfolio-cvs' AND public.has_role(auth.uid(), 'admin'));