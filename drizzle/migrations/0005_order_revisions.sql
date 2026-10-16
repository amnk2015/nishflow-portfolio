ALTER TABLE public.nishflow_portfolio_orders
  ADD COLUMN revisions_used integer NOT NULL DEFAULT 0,
  ADD COLUMN revision_status text NOT NULL DEFAULT 'Idle',
  ADD COLUMN revision_notes text,
  ADD COLUMN revision_requested_at timestamptz;
ALTER TABLE public.nishflow_portfolio_orders
  ADD CONSTRAINT revision_status_check CHECK (revision_status IN ('Idle','Requested','Completed')),
  ADD CONSTRAINT revisions_used_range CHECK (revisions_used BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION public.request_revision(_order_id uuid, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(length(trim(_notes)),0) = 0 THEN RAISE EXCEPTION 'Please describe the changes'; END IF;
  UPDATE public.nishflow_portfolio_orders
    SET revision_status = 'Requested', revision_notes = left(trim(_notes), 2000), revision_requested_at = now()
    WHERE id = _order_id AND user_id = auth.uid()
      AND order_status IN ('In Progress','Completed')
      AND revisions_used < 3 AND revision_status <> 'Requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision cannot be requested for this order'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.close_revision(_order_id uuid, _live_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.nishflow_portfolio_orders
    SET revisions_used = revisions_used + 1,
        revision_status = 'Idle',
        live_url = coalesce(nullif(trim(_live_url), ''), live_url)
    WHERE id = _order_id AND revision_status = 'Requested' AND revisions_used < 3;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open revision on this order'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.request_revision(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_revision(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_revision(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_revision(uuid, text) TO authenticated;