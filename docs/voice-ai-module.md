# Llamadas IA multiempresa

`Llamadas IA` es un módulo opcional de PayFlow. Cada negocio conserva el número
que sus clientes ya conocen y desvía sus llamadas hacia una ruta administrada
por PayFlow. La conversación puede consultar el catálogo, crear pedidos o
reservas, iniciar un cobro con PayPhone o Stripe y confirmar por WhatsApp.

## Arquitectura

PayFlow en Vercel es el **plano de control**: configuración, permisos,
catálogo, pedidos, reservas, pagos, auditoría y panel. El audio en tiempo real
debe ejecutarse en un servicio persistente separado (Pipecat con
Twilio/Fonoster/SIP). Una función serverless no debe mantener la sesión de
audio/WebSocket de una llamada completa.

El runtime no decide el `client_id`. PayFlow resuelve el negocio usando el ID
del número del proveedor o el número de destino. Esto evita que un evento de
un negocio pueda escribir pedidos o llamadas en otro.

| Componente | Responsabilidad |
|---|---|
| Vercel / PayFlow | panel, autenticación, API, catálogo, pedidos y auditoría |
| Supabase | aislamiento por `client_id`, llamadas, reservas y eventos durables |
| Runtime Pipecat | audio, interrupciones, STT/LLM/TTS y llamadas a herramientas |
| Twilio/Fonoster/SIP | recepción o desvío del número conocido del negocio |
| Stripe/PayPhone | creación y confirmación oficial del cobro |
| WhatsApp Cloud API | enlace de pago y confirmación del pedido o reserva |

## Puesta en producción

1. Aplicar, en este orden, las migraciones de hardening, catálogo, WhatsApp y
   `20260717000000_voice_ai_module.sql`.
2. Configurar `VOICE_RUNTIME_WEBHOOK_SECRET` en Vercel Production y en el
   almacén de secretos del runtime.
3. Abrir `/dashboard/llamadas`, seleccionar un negocio y solicitar el módulo.
4. Un administrador configura proveedor, número de destino/ID y cambia el
   estado a `active`. Los clientes no pueden editar estos campos técnicos.
5. Configurar con el operador el desvío del número actual hacia el destino de
   PayFlow. El número no necesita tener instalada la app de WhatsApp.
6. Probar una llamada, un pedido, una reserva, una transferencia humana y un
   pago de prueba antes de habilitar llamadas públicas.

## Contrato con el runtime

Todas las solicitudes son JSON y llevan:

```text
X-PayFlow-Signature: sha256=HMAC_SHA256(cuerpo_sin_modificar, VOICE_RUNTIME_WEBHOOK_SECRET)
```

### Obtener contexto seguro

`POST /api/voice/runtime/context` devuelve únicamente configuración no
secreta, personalidad, acciones permitidas y productos reales del negocio.

```json
{
  "provider": "twilio",
  "providerPhoneId": "PN_DESTINO",
  "businessPhone": "+593..."
}
```

El runtime debe usar los `productId` recibidos; nunca debe enviar precios. La
base de datos vuelve a calcular el total y bloquea/descuenta inventario de
forma transaccional.

### Registrar eventos y ejecutar acciones

`POST /api/voice/runtime/webhook` acepta eventos idempotentes:

- `call.started`, `call.updated`, `call.completed`;
- `order.created`;
- `reservation.created`;
- `payment.linked`.

Ejemplo de pedido:

```json
{
  "idempotencyKey": "twilio:CA123:order:1",
  "eventType": "order.created",
  "provider": "twilio",
  "providerCallId": "CA123",
  "providerPhoneId": "PN_DESTINO",
  "businessPhone": "+593...",
  "callerPhone": "+593...",
  "data": {
    "customerName": "Ana",
    "items": [{ "productId": "UUID_DEL_PRODUCTO", "quantity": 2 }],
    "notes": "Retiro en local"
  }
}
```

Las acciones se rechazan si el módulo/agente está inactivo o si el negocio
deshabilitó pedidos, reservas o pagos.

## Pagos

- La IA puede solicitar o vincular un cobro, pero **nunca** puede declarar que
  fue pagado.
- Stripe debe usar Checkout y, para múltiples comercios, Stripe Connect. La
  cuenta conectada pertenece al negocio; PayFlow conserva la clave de
  plataforma sólo en el servidor.
- PayPhone usa API Link o Sale desde el backend. Los tokens pertenecen al
  servidor/almacén de secretos, no a Supabase ni al navegador.
- Únicamente los webhooks oficiales de Stripe o PayPhone cambian el pedido a
  `paid`, `failed` o `refunded`.
- El enlace se envía por la conexión oficial de WhatsApp asociada al mismo
  `client_id`.

## Privacidad y operación

- La grabación viene desactivada. Si se activa, el agente debe informar y
  guardar el consentimiento antes de grabar.
- La retención es configurable entre 1 y 365 días.
- No se envían tokens, claves, datos de tarjeta ni credenciales al modelo.
- Los eventos tienen clave idempotente para evitar pedidos o reservas
  duplicados durante reintentos del proveedor.
- Las transcripciones sólo son visibles para el negocio correspondiente y los
  roles internos autorizados.
