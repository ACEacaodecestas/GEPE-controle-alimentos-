-- ============================================================
-- ACE - REVERTER INVENTÁRIO
-- Execute UMA ÚNICA VEZ no SQL Editor do Supabase.
--
-- O que esta função faz:
-- 1. permite apenas os administradores autorizados;
-- 2. trava o inventário durante a operação;
-- 3. aceita somente inventário finalizado;
-- 4. calcula o efeito LÍQUIDO ainda ativo daquele inventário;
-- 5. grava ajustes inversos na tabela ajustes_estoque;
-- 6. não apaga entradas, saídas, perdas ou movimentos posteriores;
-- 7. uma segunda tentativa não aplica ajuste duplicado.
-- ============================================================

create or replace function public.ace_reverter_inventario(
  p_inventario_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_inventory public.inventarios%rowtype;
  v_inserted integer := 0;
begin
  v_email :=
    lower(
      coalesce(
        auth.jwt() ->> 'email',
        ''
      )
    );

  if v_email not in (
    'aislantavares329@gmail.com',
    'alexandregonta@gmail.com'
  ) then
    raise exception
      'Somente administradores autorizados podem reverter inventários.';
  end if;

  select *
    into v_inventory
  from public.inventarios
  where id = p_inventario_id
  for update;

  if not found then
    raise exception
      'Inventário não encontrado.';
  end if;

  if v_inventory.status <> 'finalizado' then
    raise exception
      'Somente inventários finalizados podem ser revertidos.';
  end if;

  -- ==========================================================
  -- IMPORTANTE:
  -- Agrupamos todos os ajustes já existentes deste inventário.
  --
  -- Primeira reversão:
  --   líquido = ajuste original -> insere o inverso.
  --
  -- Segunda tentativa:
  --   original + inverso = zero -> nenhuma linha é inserida.
  -- ==========================================================

  insert into public.ajustes_estoque (
    inventario_id,
    data,
    origem_id,
    alimento_id,
    quantidade,
    usuario_id
  )
  select
    p_inventario_id,
    current_date,
    coalesce(
      max(a.origem_id),
      v_inventory.origem_id
    ),
    a.alimento_id,
    -sum(a.quantidade),
    auth.uid()
  from public.ajustes_estoque a
  where a.inventario_id =
    p_inventario_id
  group by
    a.alimento_id
  having abs(
    sum(a.quantidade)
  ) > 0.000001;

  get diagnostics
    v_inserted =
      row_count;

  if v_inserted = 0 then
    raise exception
      'Este inventário já foi revertido ou não possui ajuste ativo.';
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'inventario_id',
    p_inventario_id,
    'ajustes_revertidos',
    v_inserted,
    'revertido_por',
    auth.uid(),
    'revertido_em',
    now()
  );
end;
$$;


revoke all
on function public.ace_reverter_inventario(bigint)
from public;


grant execute
on function public.ace_reverter_inventario(bigint)
to authenticated;
