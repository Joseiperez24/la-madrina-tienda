// ═══════════════════════════════════════════════════════════
//  La Madrina — Servidor tienda + Mercado Pago + Email
//  Requisitos: node >= 18  |  npm install (ver package.json)
//  Arrancar:   node server.js
//  Web:        http://localhost:3000
// ═══════════════════════════════════════════════════════════
require('dotenv').config();

const express    = require('express');
const axios      = require('axios');
const nodemailer = require('nodemailer');
const path       = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// ── Config (desde .env) ──────────────────────────────────
const {
  MP_ACCESS_TOKEN,   // Access token de Mercado Pago (producción o sandbox)
  SELLER_EMAIL,      // Email donde llegan los pedidos
  SMTP_HOST   = 'smtp.gmail.com',
  SMTP_PORT   = '587',
  SMTP_USER,         // Email remitente (ej: tienda@lamadrina.com.ar)
  SMTP_PASS,         // Contraseña de app de Gmail (o SMTP password)
  BASE_URL    = 'http://localhost:3000',
  BUSINESS_NAME = 'La Madrina Forrajería',
  BANK_CBU,          // CBU para transferencias
  BANK_ALIAS,        // Alias bancario
  BANK_HOLDER,       // Titular de la cuenta
  BANK_BANK,         // Banco
  BANK_CUIT,         // CUIT del titular (opcional)
} = process.env;

// ── Nodemailer ───────────────────────────────────────────
let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ── Home → la_madrina.html ───────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'la_madrina.html'));
});

// ── GET /api/config-publico ──────────────────────────────
// Datos públicos que el frontend necesita (datos bancarios, nombre negocio)
app.get('/api/config-publico', (_req, res) => {
  res.json({
    business: BUSINESS_NAME,
    bank: {
      cbu: BANK_CBU || '',
      alias: BANK_ALIAS || '',
      holder: BANK_HOLDER || '',
      bank: BANK_BANK || '',
      cuit: BANK_CUIT || '',
    },
    mp_enabled: Boolean(MP_ACCESS_TOKEN),
  });
});

// ── POST /api/checkout (Mercado Pago) ────────────────────
app.post('/api/checkout', async (req, res) => {
  try {
    const { items, buyer } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado en .env' });
    }

    const mpItems = items.map(item => ({
      title:       String(`${item.nombre}${item.peso ? ' · ' + item.peso : ''}`).slice(0, 255),
      quantity:    Math.max(1, Number(item.qty) || 1),
      unit_price:  Math.max(0, Number(item.precio) || 0),
      currency_id: 'ARS',
      category_id: 'food',
    }));

    const preference = {
      items: mpItems,
      payer: {
        name:  buyer?.nombre || '',
        email: buyer?.email  || '',
        phone: { number: buyer?.telefono || '' },
      },
      back_urls: {
        success: `${BASE_URL}/success.html`,
        failure: `${BASE_URL}/success.html`,
        pending: `${BASE_URL}/success.html`,
      },
      auto_return: 'approved',
      notification_url: `${BASE_URL}/api/webhook`,
      external_reference: JSON.stringify({
        buyer,
        items,
        fecha: new Date().toISOString(),
      }).slice(0, 256),
      statement_descriptor: 'La Madrina Forrajeria',
      binary_mode: false,
    };

    const { data } = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      preference,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    console.log(`✓ Preferencia MP creada: ${data.id}`);
    res.json({ url: data.init_point, id: data.id });

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('Error /api/checkout:', detail);
    res.status(500).json({ error: 'No se pudo crear el pedido. Intentá de nuevo.' });
  }
});

// ── POST /api/pedido-manual (transferencia / efectivo) ───
// Registra un pedido que no pasa por MP y notifica al vendedor.
app.post('/api/pedido-manual', async (req, res) => {
  try {
    const { items, buyer, total } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }
    if (!buyer || !buyer.nombre || !buyer.telefono) {
      return res.status(400).json({ error: 'Faltan datos del comprador.' });
    }

    const metodo = buyer.metodo || 'whatsapp';
    const pedidoId = 'M' + Date.now().toString(36).toUpperCase();
    const totalNum = Number(total) || items.reduce((s, i) => s + (Number(i.precio) * Number(i.qty)), 0);

    await enviarEmailPedidoManual({ pedidoId, buyer, items, total: totalNum, metodo });

    // Si el cliente eligió transferencia y hay email, le mandamos los datos bancarios
    if (metodo === 'transferencia' && buyer.email && BANK_CBU) {
      await enviarEmailDatosTransferencia({ pedidoId, buyer, items, total: totalNum });
    }

    res.json({ ok: true, pedidoId });
  } catch (err) {
    console.error('Error /api/pedido-manual:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el pedido.' });
  }
});

// ── GET /api/payment-status/:id ──────────────────────────
// Verifica el estado real de un pago de MP (usado por success.html).
app.get('/api/payment-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP no configurado' });

    const { data: payment } = await axios.get(
      `https://api.mercadopago.com/v1/payments/${id}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    let pedido = {};
    try { pedido = JSON.parse(payment.external_reference || '{}'); } catch {}

    res.json({
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      payment_type: payment.payment_type_id,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      buyer_name: pedido?.buyer?.nombre || null,
      items: pedido?.items || [],
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('Error /api/payment-status:', detail);
    res.status(404).json({ error: 'Pago no encontrado' });
  }
});

// ── POST /api/webhook ────────────────────────────────────
// MP notifica aquí cuando un pago es aprobado.
app.post('/api/webhook', async (req, res) => {
  // Responder 200 inmediatamente (requisito de MP)
  res.status(200).send('OK');

  try {
    const { type, data } = req.body;
    if (type !== 'payment') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    const { data: payment } = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    if (payment.status !== 'approved') {
      console.log(`Pago ${paymentId} estado: ${payment.status} — sin email`);
      return;
    }

    let pedido = {};
    try { pedido = JSON.parse(payment.external_reference || '{}'); } catch {}

    const { buyer = {}, items = [] } = pedido;
    const total = items.reduce((s, i) => s + (Number(i.precio) * Number(i.qty)), 0);

    await enviarEmailPedido({ paymentId, buyer, items, total, payment });
    console.log(`✓ Email enviado — pago #${paymentId} — $${total.toLocaleString('es-AR')}`);

  } catch (err) {
    console.error('Error /api/webhook:', err.message);
  }
});

// ── Helpers de email ─────────────────────────────────────
function filasHtml(items) {
  return items.map(i => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #ede7d5;font-family:Georgia,serif;font-size:0.88rem;color:#3a3a2a;">
        ${escapeHtml(i.nombre)}${i.peso ? '<br><small style="color:#6a6a5a">' + escapeHtml(i.peso) + '</small>' : ''}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #ede7d5;text-align:center;font-family:Georgia,serif;font-size:0.88rem;color:#3a3a2a;">
        ${Number(i.qty) || 1}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #ede7d5;text-align:right;font-family:Georgia,serif;font-size:0.88rem;color:#1a4a1a;font-weight:600;">
        ${Number(i.precio) > 0 ? '$' + (Number(i.precio) * Number(i.qty)).toLocaleString('es-AR') : 'A confirmar'}
      </td>
    </tr>`).join('');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function enviarEmailPedido({ paymentId, buyer, items, total, payment }) {
  if (!transporter || !SELLER_EMAIL) {
    console.warn('Email no configurado en .env — saltando envío');
    return;
  }

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background:#f0ece2;font-family:Georgia,serif;">
    <div style="max-width:600px;margin:24px auto;background:#f8f4ec;border:1px solid #ddd8c8;">
      <div style="background:#1a4a1a;padding:24px 28px;border-bottom:3px solid #c8862a;">
        <p style="margin:0 0 4px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:#e8a84a;">La Madrina · Forrajería de La Soñada</p>
        <h1 style="margin:0;font-size:1.35rem;color:#f8f4ec;font-weight:600;">✓ Nuevo pedido confirmado</h1>
        <p style="margin:6px 0 0;font-size:0.82rem;color:rgba(248,244,236,0.6);">
          Pago #${paymentId} · ${new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
        </p>
      </div>

      <div style="padding:22px 28px 0;">
        <p style="font-family:Lora,Georgia,serif;font-size:0.68rem;letter-spacing:0.2em;text-transform:uppercase;color:#c8862a;margin:0 0 12px;">Datos del comprador</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;width:110px;">Nombre</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;font-weight:600;">${escapeHtml(buyer.nombre || '—')}</td></tr>
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;">Email</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;">${escapeHtml(buyer.email || '—')}</td></tr>
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;">Teléfono</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;">${escapeHtml(buyer.telefono || '—')}</td></tr>
          ${buyer.notas ? `<tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;vertical-align:top;">Notas</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;line-height:1.5;">${escapeHtml(buyer.notas)}</td></tr>` : ''}
        </table>
      </div>

      <div style="padding:22px 28px 0;">
        <p style="font-family:Lora,Georgia,serif;font-size:0.68rem;letter-spacing:0.2em;text-transform:uppercase;color:#c8862a;margin:0 0 12px;">Detalle del pedido</p>
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #ddd8c8;">
          <thead>
            <tr style="background:#1a4a1a;">
              <th style="padding:10px 14px;text-align:left;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Producto</th>
              <th style="padding:10px 14px;text-align:center;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Cant.</th>
              <th style="padding:10px 14px;text-align:right;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filasHtml(items)}</tbody>
          <tfoot>
            <tr style="background:#f8f4ec;">
              <td colspan="2" style="padding:12px 14px;text-align:right;font-size:0.88rem;color:#1a4a1a;font-weight:700;border-top:2px solid #c8862a;font-family:Georgia,serif;">TOTAL</td>
              <td style="padding:12px 14px;text-align:right;font-size:1.1rem;color:#1a4a1a;font-weight:700;border-top:2px solid #c8862a;font-family:Georgia,serif;">$${total.toLocaleString('es-AR')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="padding:18px 28px;">
        <div style="background:#1a4a1a;padding:14px 18px;border-left:3px solid #c8862a;">
          <p style="margin:0 0 4px;font-size:0.75rem;color:#e8a84a;font-family:Lora,Georgia,serif;letter-spacing:0.1em;text-transform:uppercase;">Estado del pago</p>
          <p style="margin:0;font-size:0.95rem;color:#f8f4ec;font-family:Georgia,serif;">
            APROBADO ✓ · Método: ${escapeHtml(payment.payment_type_id || '—')} · ID: #${paymentId}
          </p>
        </div>
      </div>

      <div style="background:#0d1f0d;padding:14px 28px;text-align:center;">
        <p style="margin:0;font-size:0.75rem;color:rgba(248,244,236,0.35);font-family:Georgia,serif;">
          La Madrina · Forrajería de La Soñada · San Francisco, Córdoba
        </p>
      </div>
    </div>
  </body>
  </html>`;

  await transporter.sendMail({
    from:    `"La Madrina Tienda" <${SMTP_USER}>`,
    to:      SELLER_EMAIL,
    subject: `🛒 Pedido #${paymentId} — $${total.toLocaleString('es-AR')} — ${buyer.nombre || 'Cliente'}`,
    html,
  });
}

async function enviarEmailPedidoManual({ pedidoId, buyer, items, total, metodo }) {
  if (!transporter || !SELLER_EMAIL) {
    console.warn('Email no configurado — saltando envío de pedido manual');
    return;
  }

  const metodoLbl = {
    whatsapp: 'Coordinar por WhatsApp',
    efectivo: 'Efectivo al retirar / entregar',
    transferencia: 'Transferencia bancaria (pendiente de comprobante)',
  }[metodo] || metodo;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background:#f0ece2;font-family:Georgia,serif;">
    <div style="max-width:600px;margin:24px auto;background:#f8f4ec;border:1px solid #ddd8c8;">
      <div style="background:#1a4a1a;padding:24px 28px;border-bottom:3px solid #c8862a;">
        <p style="margin:0 0 4px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:#e8a84a;">La Madrina · Pedido sin pago online</p>
        <h1 style="margin:0;font-size:1.35rem;color:#f8f4ec;font-weight:600;">🔔 Nuevo pedido — ${escapeHtml(metodoLbl)}</h1>
        <p style="margin:6px 0 0;font-size:0.82rem;color:rgba(248,244,236,0.6);">
          Ref: ${pedidoId} · ${new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
        </p>
      </div>

      <div style="padding:22px 28px 0;">
        <p style="font-family:Lora,Georgia,serif;font-size:0.68rem;letter-spacing:0.2em;text-transform:uppercase;color:#c8862a;margin:0 0 12px;">Comprador</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;width:110px;">Nombre</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;font-weight:600;">${escapeHtml(buyer.nombre || '—')}</td></tr>
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;">Email</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;">${escapeHtml(buyer.email || '—')}</td></tr>
          <tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;">Teléfono</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;">${escapeHtml(buyer.telefono || '—')}</td></tr>
          ${buyer.notas ? `<tr><td style="padding:4px 0;font-size:0.82rem;color:#6a6a5a;vertical-align:top;">Notas</td><td style="padding:4px 0;font-size:0.88rem;color:#1a1a14;line-height:1.5;">${escapeHtml(buyer.notas)}</td></tr>` : ''}
        </table>
      </div>

      <div style="padding:22px 28px 0;">
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #ddd8c8;">
          <thead>
            <tr style="background:#1a4a1a;">
              <th style="padding:10px 14px;text-align:left;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Producto</th>
              <th style="padding:10px 14px;text-align:center;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Cant.</th>
              <th style="padding:10px 14px;text-align:right;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#f8f4ec;font-weight:600;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filasHtml(items)}</tbody>
          <tfoot>
            <tr style="background:#f8f4ec;">
              <td colspan="2" style="padding:12px 14px;text-align:right;font-size:0.88rem;color:#1a4a1a;font-weight:700;border-top:2px solid #c8862a;font-family:Georgia,serif;">TOTAL ESTIMADO</td>
              <td style="padding:12px 14px;text-align:right;font-size:1.1rem;color:#1a4a1a;font-weight:700;border-top:2px solid #c8862a;font-family:Georgia,serif;">$${total.toLocaleString('es-AR')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="padding:18px 28px;">
        <div style="background:#c8862a;padding:12px 18px;">
          <p style="margin:0;font-size:0.88rem;color:#1a1a14;font-family:Georgia,serif;font-weight:600;">
            ⚠ Pago PENDIENTE — Método elegido: ${escapeHtml(metodoLbl)}
          </p>
        </div>
      </div>

      <div style="background:#0d1f0d;padding:14px 28px;text-align:center;">
        <p style="margin:0;font-size:0.75rem;color:rgba(248,244,236,0.35);font-family:Georgia,serif;">
          La Madrina · Forrajería de La Soñada · San Francisco, Córdoba
        </p>
      </div>
    </div>
  </body>
  </html>`;

  await transporter.sendMail({
    from:    `"La Madrina Tienda" <${SMTP_USER}>`,
    to:      SELLER_EMAIL,
    subject: `🔔 Pedido ${pedidoId} — ${metodoLbl} — $${total.toLocaleString('es-AR')} — ${buyer.nombre}`,
    html,
  });
}

async function enviarEmailDatosTransferencia({ pedidoId, buyer, items, total }) {
  if (!transporter || !buyer.email) return;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background:#f0ece2;font-family:Georgia,serif;">
    <div style="max-width:600px;margin:24px auto;background:#f8f4ec;border:1px solid #ddd8c8;">
      <div style="background:#1a4a1a;padding:24px 28px;border-bottom:3px solid #c8862a;">
        <p style="margin:0 0 4px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:#e8a84a;">La Madrina · Forrajería</p>
        <h1 style="margin:0;font-size:1.35rem;color:#f8f4ec;font-weight:600;">Datos para tu transferencia</h1>
        <p style="margin:6px 0 0;font-size:0.82rem;color:rgba(248,244,236,0.7);">Pedido ${pedidoId}</p>
      </div>

      <div style="padding:22px 28px;">
        <p style="font-size:0.95rem;color:#3a3a2a;line-height:1.7;margin:0 0 16px;">Hola ${escapeHtml((buyer.nombre || '').split(' ')[0] || 'cliente')},</p>
        <p style="font-size:0.9rem;color:#3a3a2a;line-height:1.7;margin:0 0 20px;">Gracias por tu pedido. Te dejamos los datos bancarios para la transferencia:</p>

        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #ddd8c8;">
          <tbody>
            <tr><td style="padding:10px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#6a6a5a;width:120px;border-bottom:1px solid #ede7d5;">Banco</td><td style="padding:10px 14px;font-family:Georgia,serif;font-size:0.92rem;color:#1a1a14;font-weight:600;border-bottom:1px solid #ede7d5;">${escapeHtml(BANK_BANK || '—')}</td></tr>
            <tr><td style="padding:10px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#6a6a5a;border-bottom:1px solid #ede7d5;">Titular</td><td style="padding:10px 14px;font-family:Georgia,serif;font-size:0.92rem;color:#1a1a14;font-weight:600;border-bottom:1px solid #ede7d5;">${escapeHtml(BANK_HOLDER || '—')}</td></tr>
            ${BANK_CUIT ? `<tr><td style="padding:10px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#6a6a5a;border-bottom:1px solid #ede7d5;">CUIT</td><td style="padding:10px 14px;font-family:Georgia,serif;font-size:0.92rem;color:#1a1a14;font-weight:600;border-bottom:1px solid #ede7d5;">${escapeHtml(BANK_CUIT)}</td></tr>` : ''}
            <tr><td style="padding:10px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#6a6a5a;border-bottom:1px solid #ede7d5;">CBU</td><td style="padding:10px 14px;font-family:monospace;font-size:0.98rem;color:#1a4a1a;font-weight:700;letter-spacing:0.04em;border-bottom:1px solid #ede7d5;">${escapeHtml(BANK_CBU || '—')}</td></tr>
            <tr><td style="padding:10px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#6a6a5a;border-bottom:1px solid #ede7d5;">Alias</td><td style="padding:10px 14px;font-family:monospace;font-size:0.98rem;color:#1a4a1a;font-weight:700;letter-spacing:0.04em;border-bottom:1px solid #ede7d5;">${escapeHtml(BANK_ALIAS || '—')}</td></tr>
            <tr style="background:#f8f4ec;"><td style="padding:12px 14px;font-family:Lora,Georgia,serif;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#c8862a;font-weight:700;">Importe</td><td style="padding:12px 14px;font-family:Georgia,serif;font-size:1.25rem;color:#1a4a1a;font-weight:700;">$${total.toLocaleString('es-AR')}</td></tr>
          </tbody>
        </table>

        <div style="background:rgba(200,134,42,0.1);border-left:3px solid #c8862a;padding:14px 18px;margin-top:20px;">
          <p style="margin:0;font-size:0.88rem;color:#3a3a2a;line-height:1.6;">
            Una vez realizada la transferencia, enviá el comprobante por <strong>WhatsApp al 3564-679338</strong> o respondé este email. Apenas lo recibimos coordinamos la entrega o retiro.
          </p>
        </div>
      </div>

      <div style="background:#0d1f0d;padding:14px 28px;text-align:center;">
        <p style="margin:0;font-size:0.75rem;color:rgba(248,244,236,0.35);font-family:Georgia,serif;">
          La Madrina · Forrajería de La Soñada · San Francisco, Córdoba
        </p>
      </div>
    </div>
  </body>
  </html>`;

  await transporter.sendMail({
    from:    `"La Madrina" <${SMTP_USER}>`,
    to:      buyer.email,
    subject: `Datos para tu transferencia — Pedido ${pedidoId} — La Madrina`,
    html,
  });
}

// ── Inicio ───────────────────────────────────────────────
// Exportar app para Vercel (serverless). En local se levanta con app.listen().
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('');
    console.log('  ✦ La Madrina — Tienda online');
    console.log(`  ✦ Corriendo en http://localhost:${PORT}`);
    console.log('');
    if (!MP_ACCESS_TOKEN) console.warn('  ⚠  MP_ACCESS_TOKEN no configurado — los pagos online no funcionarán');
    if (!transporter)     console.warn('  ⚠  SMTP no configurado — los emails no se enviarán');
    if (!BANK_CBU)        console.warn('  ⚠  BANK_CBU no configurado — no se podrán enviar datos de transferencia');
    console.log('');
  });
}
