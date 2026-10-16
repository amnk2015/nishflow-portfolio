alter table public.nishflow_portfolio_orders add column price_lkr integer;

update public.nishflow_portfolio_orders
   set price_lkr = case package_selected
         when 'Basic Portfolio' then 2999
         when 'Premium Interactive' then 4999
         else 0
       end
 where price_lkr is null;

comment on column public.nishflow_portfolio_orders.price_lkr is 'Price in LKR captured at order time from the selected package.';