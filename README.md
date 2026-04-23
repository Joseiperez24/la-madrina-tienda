# La Madrina — Forrajería

Tienda online con carrito de compras, pagos con Mercado Pago, transferencia bancaria y efectivo.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML/CSS/JS vanilla (sin framework)
- **Pagos:** Mercado Pago (Checkout Pro)
- **Email:** Nodemailer (SMTP)

## Estructura

```
forrajeria/
├── la_madrina.html       # Tienda principal
├── success.html          # Página de confirmación (MP + manual)
├── server.js             # Backend Express
├── package.json          # Dependencias
├── .env.example          # Plantilla de config (copiar a .env)
├── .gitignore
└── imgs/                 # Imágenes productos, decoración, logos
```

## Instalación local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar plantilla de variables y completar
cp .env.example .env
# Editar .env con tus credenciales de MP, SMTP y datos bancarios

# 3. Iniciar servidor
npm start
# O con auto-reload:
npm run dev
```

Abrir http://localhost:3000

## Variables de entorno (.env)

Ver `.env.example`. Campos obligatorios:

| Variable | Descripción |
|---|---|
| `MP_ACCESS_TOKEN` | Token de Mercado Pago (producción o test) |
| `SELLER_EMAIL` | Email donde llegan los pedidos |
| `SMTP_USER` / `SMTP_PASS` | Credenciales para enviar emails |
| `BASE_URL` | URL pública del sitio (para webhook MP) |
| `BANK_CBU` / `BANK_ALIAS` / `BANK_HOLDER` | Datos para transferencias |

## Endpoints

| Ruta | Método | Descripción |
|---|---|---|
| `/` | GET | Home (la_madrina.html) |
| `/api/config-publico` | GET | Datos bancarios + estado MP (para frontend) |
| `/api/checkout` | POST | Crea preferencia MP y devuelve URL de pago |
| `/api/pedido-manual` | POST | Registra pedido sin MP (transferencia/efectivo) |
| `/api/payment-status/:id` | GET | Verifica estado real de un pago MP |
| `/api/webhook` | POST | Recibe notificaciones de pagos aprobados |

## Flujo de compra

1. Cliente agrega productos al carrito (persiste en `localStorage`).
2. Abre el checkout y elige método de pago:
   - **Mercado Pago** → se crea preferencia → se redirige a MP → vuelve a `success.html`.
   - **Transferencia** → registra pedido → recibe datos bancarios por email + WhatsApp.
   - **Efectivo** → registra pedido → coordinamos entrega por WhatsApp.
   - **WhatsApp** → envía mensaje directo con el detalle del pedido.
3. El vendedor recibe email en `SELLER_EMAIL` con el detalle.

## Deploy a producción

### Opción A: Render, Railway, Fly.io (fácil)

1. Creá un repositorio en GitHub y subí el código.
2. Conectá el repo al servicio (Render / Railway).
3. Configurá las variables de entorno en el panel del servicio.
4. `BASE_URL` debe ser la URL pública que te da el servicio.
5. En Mercado Pago → Webhooks → configurá la URL:
   `https://tudominio.com/api/webhook`

### Opción B: VPS con dominio propio

1. Instalar Node.js 18+ en el servidor.
2. Clonar el repo y `npm install`.
3. Configurar `.env` con `BASE_URL=https://tudominio.com`.
4. Correr con PM2: `pm2 start server.js --name lamadrina`.
5. Nginx como reverse proxy a puerto 3000 + SSL con Certbot.

### Gmail / Email

Si usás Gmail como SMTP:
1. Activá verificación en 2 pasos.
2. Generá "Contraseña de aplicación" en https://myaccount.google.com/apppasswords
3. Usá esa contraseña en `SMTP_PASS`.

## Testeo de Mercado Pago

Usar credenciales **TEST-...** y tarjetas de prueba:
- Mastercard: `5031 7557 3453 0604` · CVV `123` · Venc. `11/25`
- Titular para aprobado: `APRO APRO`
- Titular para rechazado: `OTHE OTHE`

Más info: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards

## Pendientes antes de salir a producción

- [ ] Completar precios reales de productos (el HTML tiene algunos en 0)
- [ ] Revisar que todas las imágenes de productos estén subidas
- [ ] Cargar credenciales MP de producción en `.env`
- [ ] Configurar webhook MP apuntando a `https://tudominio.com/api/webhook`
- [ ] Verificar que el email `SELLER_EMAIL` reciba correctamente
- [ ] Probar compra end-to-end con tarjeta real por un monto mínimo
- [ ] Revisar textos legales / políticas si aplica
