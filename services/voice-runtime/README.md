# PayFlow Voice Runtime

Servicio persistente para el módulo opcional **Llamadas IA**. Railway recibe los
webhooks de telefonía, PayFlow en Vercel continúa como plano de control y
Supabase conserva configuración, llamadas, pedidos y auditoría.

## Arquitectura actual

- **Telnyx** es el proveedor principal para llamadas entrantes.
- **Twilio ConversationRelay** permanece como alternativa.
- PayFlow nunca acepta un `clientId` suministrado por la llamada.
- El negocio se resuelve usando `connection_id`, el ID del número del proveedor
  o el número de destino configurado.
- La IA no inicia llamadas ni transfiere a otro número. El producto actual es
  estrictamente de atención entrante.

Cada negocio registra en PayFlow el número que ya conocen sus clientes. Para
que la IA pueda contestarlo, el operador debe desviar ese número hacia una ruta
Telnyx exclusiva, portarlo o conectarlo mediante SIP. Escribir un número en el
panel no cambia por sí solo el enrutamiento de la red telefónica.

## Telnyx

El runtime usa una **Voice API Application** de Telnyx y adjunta a la llamada el
asistente creado en `AI Suite > Assistants` mediante `ai_assistant_start`.
Telnyx se encarga del audio, interrupciones, STT y TTS. El runtime inyecta en
cada llamada el nombre, instrucciones y catálogo del negocio resuelto.

Variables requeridas en Railway:

```text
TELNYX_API_KEY
TELNYX_PUBLIC_KEY
TELNYX_ASSISTANT_ID
TELNYX_VALIDATE_SIGNATURES=true
```

`TELNYX_VOICE` es opcional. Déjalo vacío para usar la voz configurada en el
asistente del portal.

Configura la Voice API Application con este webhook:

```text
POST https://DOMINIO-RAILWAY/telnyx/voice
```

Asocia a esa aplicación el número Telnyx o la ruta SIP de entrada. No configures
un Outbound Voice Profile para esta primera versión.

## Despliegue en Railway

1. Crea un servicio desde este repositorio.
2. En `Settings > Source > Root Directory` escribe `/services/voice-runtime`.
3. Genera un dominio público de Railway.
4. Copia `.env.example` como variables del servicio y completa los secretos.
5. Verifica que `GET /health` responda `200`.
6. Configura el webhook de Telnyx o Twilio según el proveedor.

El valor `VOICE_RUNTIME_WEBHOOK_SECRET` debe coincidir exactamente con el de
Vercel. `VOICE_SESSION_SECRET` debe ser distinto y existir sólo en Railway.

## Flujo Telnyx entrante

1. Telnyx envía `call.initiated` a `/telnyx/voice`.
2. El runtime rechaza cualquier evento con dirección saliente.
3. PayFlow resuelve el negocio por `connection_id` o número llamado.
4. El runtime contesta y adjunta el `TELNYX_ASSISTANT_ID`.
5. Las instrucciones y el catálogo se personalizan para ese negocio.
6. El asistente detecta el idioma del cliente y responde en el mismo idioma.
7. Los eventos y transcripciones se guardan con claves idempotentes.

## Pedidos, pagos y WhatsApp

La voz nunca recibe datos de tarjeta ni declara pagos aprobados. La creación de
pedidos y enlaces de pago debe ejecutarse mediante herramientas webhook
validadas por PayFlow. Supabase recalcula precios e inventario y los webhooks
oficiales de Stripe o PayPhone son los únicos que pueden marcar un pago como
exitoso. La confirmación puede enviarse por WhatsApp Cloud API al mismo negocio.

Hasta conectar esas herramientas, el asistente puede conversar, consultar el
catálogo y construir la intención del pedido, pero no debe afirmar que el pedido
fue guardado.
