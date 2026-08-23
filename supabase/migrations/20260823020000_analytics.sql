begin;

create index pass_transactions_business_created_idx
  on public.pass_transactions (business_id, created_at desc);

drop policy if exists "members read business transactions" on public.pass_transactions;
create policy "authorized members read transactions"
on public.pass_transactions
for select
to authenticated
using (
  public.can_manage_business(auth.uid(), business_id)
  or (
    branch_id is not null
    and exists (
      select 1
      from public.staff_members s
      join public.staff_branch_assignments a
        on a.business_id = s.business_id and a.staff_id = s.id
      where s.auth_user_id = auth.uid()
        and s.business_id = pass_transactions.business_id
        and s.status = 'active'
        and a.branch_id = pass_transactions.branch_id
    )
  )
);

create or replace function public.business_analytics(
  _business_id uuid,
  _date_from date default current_date - 29,
  _date_to date default current_date,
  _branch_id uuid default null,
  _staff_id uuid default null,
  _program_type text default null,
  _action text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _full_access boolean := public.can_manage_business(auth.uid(), _business_id);
  _role text;
  _result jsonb;
begin
  if auth.uid() is null or not public.can_access_business(auth.uid(), _business_id) then
    raise exception 'Analytics access denied';
  end if;
  if _date_from is null or _date_to is null or _date_from > _date_to
    or _date_to - _date_from > 366 then
    raise exception 'Analytics date range is invalid';
  end if;
  if _program_type is not null and _program_type not in ('stamp', 'points', 'coupon_morph') then
    raise exception 'Analytics program filter is invalid';
  end if;
  if _action is not null and _action not in ('earn', 'redeem') then
    raise exception 'Analytics action filter is invalid';
  end if;

  select coalesce((
    select s.role
    from public.staff_members s
    where s.auth_user_id = auth.uid()
      and s.business_id = _business_id
      and s.status = 'active'
    limit 1
  ), case when _full_access then 'owner' else 'staff' end)
  into _role;

  if not _full_access and not exists (
    select 1
    from public.staff_members s
    join public.staff_branch_assignments a
      on a.business_id = s.business_id and a.staff_id = s.id
    where s.auth_user_id = auth.uid()
      and s.business_id = _business_id
      and s.status = 'active'
  ) then
    raise exception 'Analytics access denied';
  end if;

  if _branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = _branch_id
      and b.business_id = _business_id
      and (
        _full_access
        or exists (
          select 1
          from public.staff_members s
          join public.staff_branch_assignments a
            on a.business_id = s.business_id and a.staff_id = s.id
          where s.auth_user_id = auth.uid()
            and s.business_id = _business_id
            and s.status = 'active'
            and a.branch_id = b.id
        )
      )
  ) then
    raise exception 'Analytics access denied';
  end if;

  if _staff_id is not null and not exists (
    select 1
    from public.staff_members target
    where target.id = _staff_id
      and target.business_id = _business_id
      and (
        _full_access
        or exists (
          select 1
          from public.staff_members viewer
          join public.staff_branch_assignments viewer_assignment
            on viewer_assignment.business_id = viewer.business_id
            and viewer_assignment.staff_id = viewer.id
          join public.staff_branch_assignments target_assignment
            on target_assignment.business_id = target.business_id
            and target_assignment.staff_id = target.id
            and target_assignment.branch_id = viewer_assignment.branch_id
          where viewer.auth_user_id = auth.uid()
            and viewer.business_id = _business_id
            and viewer.status = 'active'
        )
      )
  ) then
    raise exception 'Analytics access denied';
  end if;

  with authorized_branches as (
    select b.id, b.name_ar, b.name_en, b.status
    from public.branches b
    where b.business_id = _business_id
      and (
        _full_access
        or exists (
          select 1
          from public.staff_members s
          join public.staff_branch_assignments a
            on a.business_id = s.business_id and a.staff_id = s.id
          where s.auth_user_id = auth.uid()
            and s.business_id = _business_id
            and s.status = 'active'
            and a.branch_id = b.id
        )
      )
  ), visible_staff as (
    select distinct s.id, s.name_ar, s.name_en, s.role
    from public.staff_members s
    where s.business_id = _business_id
      and s.status = 'active'
      and (
        _full_access
        or exists (
          select 1
          from public.staff_branch_assignments a
          join authorized_branches b on b.id = a.branch_id
          where a.business_id = s.business_id and a.staff_id = s.id
        )
      )
  ), filtered as (
    select t.*
    from public.pass_transactions t
    where t.business_id = _business_id
      and t.created_at >= _date_from::timestamp at time zone 'Asia/Riyadh'
      and t.created_at < (_date_to + 1)::timestamp at time zone 'Asia/Riyadh'
      and (_full_access or t.branch_id in (select id from authorized_branches))
      and (_branch_id is null or t.branch_id = _branch_id)
      and (_staff_id is null or t.staff_id = _staff_id)
      and (_program_type is null or t.program_type = _program_type)
      and (_action is null or (_action = 'redeem' and t.action = 'redeem')
        or (_action = 'earn' and t.action in ('stamp', 'points')))
  ), summary as (
    select jsonb_build_object(
      'totalTransactions', count(*),
      'earns', count(*) filter (where action in ('stamp', 'points')),
      'redemptions', count(*) filter (where action = 'redeem'),
      'redemptionRate', case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where action = 'redeem') / count(*), 1) end,
      'loyaltySarActivity', coalesce(sum(amount_sar), 0),
      'stampsIssued', coalesce(sum(greatest(stamp_delta, 0)), 0),
      'stampsRedeemed', coalesce(sum(abs(least(stamp_delta, 0))), 0),
      'pointsIssued', coalesce(sum(greatest(points_delta, 0)), 0),
      'pointsRedeemed', coalesce(sum(abs(least(points_delta, 0))), 0),
      'introCouponRedemptions', count(*) filter (
        where program_type = 'coupon_morph' and action = 'redeem' and morph_applied
      ),
      'morphTransitions', count(*) filter (where morph_applied),
      'unattributed', count(*) filter (where branch_id is null),
      'activeBranches', (select count(*) from authorized_branches where status = 'active'),
      'activeStaff', count(distinct staff_id) filter (where staff_id is not null)
    ) value
    from filtered
  ), trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', activity_date,
      'earns', earns,
      'redemptions', redemptions,
      'total', total,
      'amountSar', amount_sar
    ) order by activity_date), '[]'::jsonb) value
    from (
      select (created_at at time zone 'Asia/Riyadh')::date activity_date,
        count(*) filter (where action in ('stamp', 'points')) earns,
        count(*) filter (where action = 'redeem') redemptions,
        count(*) total,
        coalesce(sum(amount_sar), 0) amount_sar
      from filtered group by (created_at at time zone 'Asia/Riyadh')::date
    ) grouped
  ), programs as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'program', program_type,
      'total', total,
      'earns', earns,
      'redemptions', redemptions
    ) order by total desc), '[]'::jsonb) value
    from (
      select coalesce(program_type, 'legacy') program_type,
        count(*) total,
        count(*) filter (where action in ('stamp', 'points')) earns,
        count(*) filter (where action = 'redeem') redemptions
      from filtered group by coalesce(program_type, 'legacy')
    ) grouped
  ), branch_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', branch_id,
      'nameAr', name_ar,
      'nameEn', name_en,
      'total', total,
      'earns', earns,
      'redemptions', redemptions,
      'amountSar', amount_sar,
      'activeStaff', active_staff
    ) order by total desc), '[]'::jsonb) value
    from (
      select f.branch_id,
        coalesce(b.name_ar, 'غير منسوب / قديم') name_ar,
        coalesce(b.name_en, 'Unattributed / Legacy') name_en,
        count(*) total,
        count(*) filter (where f.action in ('stamp', 'points')) earns,
        count(*) filter (where f.action = 'redeem') redemptions,
        coalesce(sum(f.amount_sar), 0) amount_sar,
        count(distinct f.staff_id) filter (where f.staff_id is not null) active_staff
      from filtered f
      left join authorized_branches b on b.id = f.branch_id
      group by f.branch_id, b.name_ar, b.name_en
    ) grouped
  ), staff_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', staff_id,
      'nameAr', name_ar,
      'nameEn', name_en,
      'role', role,
      'total', total,
      'earns', earns,
      'redemptions', redemptions,
      'amountSar', amount_sar
    ) order by total desc), '[]'::jsonb) value
    from (
      select f.staff_id,
        coalesce(s.name_ar, 'غير منسوب / قديم') name_ar,
        coalesce(s.name_en, 'Unattributed / Legacy') name_en,
        s.role,
        count(*) total,
        count(*) filter (where f.action in ('stamp', 'points')) earns,
        count(*) filter (where f.action = 'redeem') redemptions,
        coalesce(sum(f.amount_sar), 0) amount_sar
      from filtered f
      left join visible_staff s on s.id = f.staff_id
      group by f.staff_id, s.name_ar, s.name_en, s.role
    ) grouped
  ), recent as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'createdAt', created_at,
      'action', action,
      'program', program_type,
      'amountSar', amount_sar,
      'stampDelta', stamp_delta,
      'pointsDelta', points_delta,
      'morphApplied', morph_applied,
      'branchNameAr', branch_name_ar,
      'branchNameEn', branch_name_en,
      'staffNameAr', staff_name_ar,
      'staffNameEn', staff_name_en,
      'deviceName', cashier_device_name
    ) order by created_at desc), '[]'::jsonb) value
    from (
      select f.id, f.created_at, f.action, f.program_type, f.amount_sar,
        f.stamp_delta, f.points_delta, f.morph_applied, f.cashier_device_name,
        coalesce(b.name_ar, 'غير منسوب / قديم') branch_name_ar,
        coalesce(b.name_en, 'Unattributed / Legacy') branch_name_en,
        coalesce(s.name_ar, 'غير منسوب / قديم') staff_name_ar,
        coalesce(s.name_en, 'Unattributed / Legacy') staff_name_en
      from filtered f
      left join authorized_branches b on b.id = f.branch_id
      left join visible_staff s on s.id = f.staff_id
      order by f.created_at desc
      limit 50
    ) latest
  )
  select jsonb_build_object(
    'access', jsonb_build_object('role', _role, 'scope', case when _full_access then 'business' else 'branches' end),
    'summary', summary.value,
    'trend', trend.value,
    'programs', programs.value,
    'branches', branch_activity.value,
    'staff', staff_activity.value,
    'recent', recent.value,
    'filters', jsonb_build_object(
      'branches', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nameAr', name_ar, 'nameEn', name_en
      ) order by name_en), '[]'::jsonb) from authorized_branches),
      'staff', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nameAr', name_ar, 'nameEn', name_en
      ) order by name_en), '[]'::jsonb) from visible_staff)
    )
  ) into _result
  from summary, trend, programs, branch_activity, staff_activity, recent;

  return _result;
end;
$$;

revoke all on function public.business_analytics(uuid, date, date, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.business_analytics(uuid, date, date, uuid, uuid, text, text)
  to authenticated;

commit;
