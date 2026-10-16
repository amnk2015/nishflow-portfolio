ALTER TABLE public.nishflow_portfolio_orders DROP CONSTRAINT IF EXISTS nishflow_portfolio_orders_profession_type_check;
ALTER TABLE public.nishflow_portfolio_orders ADD COLUMN IF NOT EXISTS designation text;
ALTER TABLE public.nishflow_portfolio_orders ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';