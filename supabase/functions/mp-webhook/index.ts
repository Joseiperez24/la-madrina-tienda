import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const body = await req.json()

    if (body.type !== 'payment') {
      return new Response('ok', { status: 200 })
    }

    const paymentId = body.data?.id
    if (!paymentId) return new Response('ok', { status: 200 })

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN') || 'TEST-2254456957933817-050213-44e54a7c16d335615e6df2f90655c1de-783672036'
    if (!mpToken) return new Response('error: MP_ACCESS_TOKEN missing', { status: 500 })

    // Consultar estado real del pago en MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpToken}` },
    })
    const mpData = await mpRes.json()

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const statusMap: Record<string, string> = {
      approved:   'paid',
      pending:    'pending',
      in_process: 'pending',
      rejected:   'cancelled',
      cancelled:  'cancelled',
      refunded:   'cancelled',
    }
    const newStatus = statusMap[mpData.status] || 'pending'

    await supa
      .from('orders')
      .update({
        status: newStatus,
        mp_status: mpData.status,
        mp_status_detail: mpData.status_detail,
      })
      .eq('mp_payment_id', String(paymentId))

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('webhook error:', err)
    return new Response('error', { status: 500 })
  }
})
