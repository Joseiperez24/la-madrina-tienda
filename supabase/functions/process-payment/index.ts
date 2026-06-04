import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      token, payment_method_id, installments, issuer_id,
      payer, customer, items,
      subtotal, discount_code, discount_amount, shipping_cost, total,
      notes,
    } = body

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN') || 'TEST-2254456957933817-050213-44e54a7c16d335615e6df2f90655c1de-783672036'
    if (!mpToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Crear pago en MercadoPago (server-side con access token)
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: total,
        token,
        description: `Pedido — La Madrina Forrajería`,
        installments: installments || 1,
        payment_method_id,
        issuer_id,
        payer: {
          // En test, MP requiere que el payer sea el mismo dueño de las credenciales TEST
          email: payer?.email || customer?.email,
          identification: payer?.identification,
        },
        metadata: { customer_email: customer?.email },
      }),
    })

    const mpData = await mpRes.json()

    if (!mpRes.ok) {
      return new Response(
        JSON.stringify({ error: mpData.message || 'Error en MercadoPago' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Guardar orden en Supabase
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: order, error: dbErr } = await supa
      .from('orders')
      .insert({
        status: mpData.status === 'approved' ? 'paid' : 'pending',
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || null,
        shipping_province: customer.address?.province || null,
        shipping_address: customer.address || {},
        items,
        subtotal,
        discount_code: discount_code || null,
        discount_amount: discount_amount || 0,
        shipping_cost: shipping_cost || 0,
        total,
        notes: notes || null,
        mp_payment_id: String(mpData.id),
        mp_status: mpData.status,
        mp_status_detail: mpData.status_detail,
      })
      .select('order_number, status')
      .single()

    if (dbErr) throw new Error(dbErr.message)

    // 3. Descontar stock de cada producto
    for (const item of items) {
      await supa.rpc('decrement_stock', { product_id: item.id, qty: item.qty }).catch(() => {})
    }

    return new Response(
      JSON.stringify({ order_number: order.order_number, status: order.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('process-payment error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
