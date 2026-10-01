create table public.wordclick_vocabulary (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    word_key text not null check (char_length(word_key) between 1 and 120),
    payload jsonb not null check (jsonb_typeof(payload) = 'object' and char_length(payload::text) <= 12000),
    updated_at timestamptz not null default now(),
    unique (user_id, word_key)
);

alter table public.wordclick_vocabulary enable row level security;
revoke all on public.wordclick_vocabulary from anon, authenticated;
grant select, insert, update, delete on public.wordclick_vocabulary to authenticated;

create policy "Read own words" on public.wordclick_vocabulary
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own words" on public.wordclick_vocabulary
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own words" on public.wordclick_vocabulary
    for update to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
create policy "Delete own words" on public.wordclick_vocabulary
    for delete to authenticated using ((select auth.uid()) = user_id);

-- Invoker rights keep RLS active. The owner is taken from the verified JWT;
-- there is deliberately no p_user_id parameter and no service-role bypass.
create function public.wordclick_save_vocabulary(p_word_key text, p_payload jsonb)
returns table (id uuid, payload jsonb)
language plpgsql security invoker set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if jsonb_typeof(p_payload) <> 'object' or
       char_length(coalesce(p_payload->>'translation', '')) not between 1 and 1000 or
       char_length(coalesce(p_payload->>'word', '')) not between 1 and 120 then
        raise exception 'Word and translation required' using errcode = '22023';
    end if;
    return query
        insert into public.wordclick_vocabulary as v (user_id, word_key, payload)
        values (auth.uid(), lower(trim(p_word_key)), p_payload - 'id' - 'user_id')
        on conflict (user_id, word_key) do update
        set payload = (v.payload || excluded.payload) ||
            jsonb_build_object('dateAdded', coalesce(v.payload->'dateAdded', excluded.payload->'dateAdded')),
            updated_at = now()
        returning v.id, v.payload;
end;
$$;
revoke all on function public.wordclick_save_vocabulary(text, jsonb) from public, anon;
grant execute on function public.wordclick_save_vocabulary(text, jsonb) to authenticated;
