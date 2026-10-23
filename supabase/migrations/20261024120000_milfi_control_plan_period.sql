-- MilFi · Control: the Fiorella plan month a savings deposit belongs to.
--
-- "period" stays the month a movement belongs to (the month of its date, or the
-- Mes/Año row of the workbook). The plan month is chosen by the person who
-- registers a savings deposit; deposits loaded from the workbook have none until
-- someone assigns it. Only savings deposits can carry one. Nothing is backfilled.
alter table public.control_movements
  add column plan_year smallint check (plan_year between 1 and 9999),
  add column plan_month smallint check (plan_month between 1 and 12),
  add constraint control_movements_plan_pair check ((plan_year is null) = (plan_month is null)),
  add constraint control_movements_plan_savings check (plan_year is null or (kind = 'deposit' and purpose = 'savings'));
