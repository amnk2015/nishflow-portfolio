ALTER TABLE public.nishflow_portfolio_orders ADD COLUMN cv_urls text[] NOT NULL DEFAULT '{}';
UPDATE public.nishflow_portfolio_orders SET cv_urls = ARRAY[cv_url] WHERE cv_url IS NOT NULL;
COMMENT ON COLUMN public.nishflow_portfolio_orders.cv_url IS 'DEPRECATED: replaced by cv_urls';