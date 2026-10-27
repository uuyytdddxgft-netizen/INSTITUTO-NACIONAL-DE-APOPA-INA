begin;

create or replace function public.register_anonymous_student(p_institution_id uuid, p_access_code text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  redeemed_code_id uuid;
  normalized_access_code text;
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    or not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'student'
    )
    or not exists (
      select 1 from public.institutions i where i.id = p_institution_id
    ) then
    raise exception 'No autorizado para iniciar una sesión de reporte';
  end if;

  if exists (
    select 1 from public.institution_members m
    where m.institution_id = p_institution_id and m.user_id = auth.uid()
  ) then
    return;
  end if;

  normalized_access_code := regexp_replace(lower(trim(coalesce(p_access_code, ''))), '[[:space:]]', '', 'g');
  if normalized_access_code !~ '^([0-9a-f]{4}|[0-9a-f]{48})$' then
    raise exception 'Código de acceso no válido';
  end if;

  update public.student_access_codes
  set used_at = now(), used_by = auth.uid()
  where institution_id = p_institution_id
    and code_hash = encode(
      extensions.digest(convert_to(normalized_access_code, 'UTF8'), 'sha256'),
      'hex'
    )
    and used_at is null
    and expires_at > now()
  returning id into redeemed_code_id;

  if redeemed_code_id is null then
    raise exception 'Código de acceso no válido';
  end if;

  insert into public.institution_members (institution_id, user_id)
  values (p_institution_id, auth.uid())
  on conflict (institution_id, user_id) do nothing;
end;
$$;

commit;
