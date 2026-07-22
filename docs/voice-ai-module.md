# Llamadas IA multiempresa

`Llamadas IA` es un módulo opcional de PayFlow para atender **solo llamadas
entrantes**. Cada negocio conserva el número que sus clientes ya conocen y lo
conecta mediante desvío, portabilidad o SIP a una ruta administrada por
PayFlow. La conversación puede consultar el catálogo, preparar pedidos o
reservas, iniciar un cobro seguro y confirmar por WhatsApp.

## Arquitectura

PayFlow en Vercel es el **plano de control**: configuración, permisos, catálogo,
pedidos, reservas, pagos, auditoría y panel. `services/voice-runtime` se ejecuta
en Railway y recibe los webhooks de telefonía.

El runtime nunca decide el `client_id` ni lo acepta desde la llamada. PayFlow
resuelve el negocio usando el ID del número del proveedor, `connection_id` o el
número de destino. Esto evita mezclar datos entre empresas.

| Componente | Responsabilidad |
|---|---|
| Vercel / PayFlow | panel, autenticación, API, catálogo, pedidos y auditoría |
| Supabase | aislamiento por `client_id`, llamadas, reservas y eventos durables |
| Runtime Railway | webhooks de voz, validación, enrutamiento y eventos |
| Telnyx | recepción de llamadas y AI Assistant alojado |
| Twilio | proveedor alternativo con ConversationRelay |
| Stripe/PayPhone | creación y confirmación oficial del cobro |
| WhatsApp Cloud API | enlace de pago y confirmación del pedido o reserva |

## Modelo telefónico

El cliente registra en PayFlow su número habitual, pero registrar el dato no
cambia la red telefónica. Para que la IA conteste se requiere una de estas
rutas:

1. desviar el número actual hacia un número o destino Telnyx;
2. portar el número a Telnyx;
3. conectar el operador o central del negocio mediante SIP.

La primera versión asigna una ruta Telnyx exclusiva por negocio. El número de
destino permite identificar de forma segura qué catálogo, agente y reglas deben
cargarse.

PayFlow no realiza campañas, marcación automática ni transferencias. Una
transferencia humana generaría otra llamada saliente y permanece deshabilitada.

## Puesta en producción

1. Aplicar las migraciones de hardening, catálogo, WhatsApp,
   `20260717000000_voice_ai_module.sql` y
   `20260718000000_telnyx_inbound_provider.sql`.
2. Configurar `VOICE_RUNTIME_WEBHOOK_SECRET` en Vercel y Railway.
3. Configurar en Railway `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` y
   `TELNYX_ASSISTANT_ID`.
4. Crear una Voice API Application en Telnyx con webhook:

```text
POST https://DOMINIO-RAILWAY/telnyx/voice
```

5. Asociar el número Telnyx o la ruta SIP a esa aplicación.
6. En `/dashboard/llamadas`, registrar el número habitual del negocio y
   aprovisionar `provider_phone_id`/`routing_phone`.
7. Probar una llamada entrante completa antes de habilitarla al público.

## Flujo Telnyx

1. Telnyx envía `call.initiated`.
2. El runtime ignora cualquier dirección que no sea entrante.
3. PayFlow resuelve el negocio por `connection_id` o número llamado.
4. El runtime responde la llamada.
5. En `call.answered`, adjunta el asistente configurado mediante
   `ai_assistant_start`.
6. Las instrucciones, saludo y catálogo se personalizan para el negocio.
7. El asistente detecta el idioma y responde en el mismo idioma.
8. Los eventos, duración, resumen y transcripción se guardan en Supabase.

## Contrato interno con PayFlow

Todas las solicitudes entre Railway y PayFlow llevan:

```text
X-PayFlow-Signature: sha256=HMAC_SHA256(cuerpo_sin_modificar, VOICE_RUNTIME_WEBHOOK_SECRET)
```

### Obtener contexto

`POST /api/voice/runtime/context` recibe:

```json
{
  "provider": "telnyx",
  "providerPhoneId": "CONNECTION_ID",
  "businessPhone": "+593..."
}
```

Devuelve únicamente configuración no secreta, personalidad, acciones
permitidas y productos publicados del negocio correspondiente.

### Registrar eventos

`POST /api/voice/runtime/webhook` acepta eventos idempotentes:

- `call.started`, `call.updated`, `call.completed`;
- `order.created`;
- `reservation.created`;
- `payment.linked`.

Las acciones se rechazan si el módulo o el agente están inactivos. Los pedidos
usan UUID de producto y la base de datos vuelve a calcular precios, total e
inventario; nunca confía en montos generados por la IA.

## Conversación

El agente debe:

- hablar con frases breves y naturales;
- hacer una pregunta a la vez;
- detectar español, inglés, portugués u otro idioma compatible;
- recomendar promociones solo cuando sean pertinentes;
- no inventar productos, precios, horarios ni disponibilidad;
- explicar que es el asistente virtual si se lo preguntan;
- no afirmar que una acción fue guardada sin confirmación de una herramienta.

## Pagos y privacidad

- La IA nunca solicita tarjeta completa, CVV, contraseñas ni códigos.
- Solo los webhooks oficiales de PayPhone o Stripe cambian un pago a `paid`,
  `failed` o `refunded`.
- La grabación está desactivada por defecto y requiere consentimiento.
- Las transcripciones solo son visibles para el negocio correspondiente y los
  roles internos autorizados.
- No se envían secretos, tokens ni credenciales al modelo.
