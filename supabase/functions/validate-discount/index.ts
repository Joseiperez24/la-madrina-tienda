import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { code } = await req.json()
    if (!code) {
      return new Response(
        JSON.stringify({ error: 'Código requerido' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supa
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Código inválido o inactivo' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Código expirado' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (data.max_uses && data.used_count >= data.max_uses) {
      return new Response(
        JSON.stringify({ error: 'Código agotado' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ valid: true, discount_pct: data.discount_pct, code: data.code }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Error interno' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
