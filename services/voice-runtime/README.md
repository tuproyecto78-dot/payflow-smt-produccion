# PayFlow Voice Runtime

Servicio persistente para el módulo opcional **Llamadas IA**. Railway mantiene
el WebSocket de Twilio ConversationRelay durante toda la llamada; PayFlow en
Vercel continúa siendo el plano de control y Supabase conserva la auditoría.

## Aislamiento multiempresa

El runtime nunca acepta `clientId` desde Twilio ni desde el modelo. Para cada
llamada envía a PayFlow el número Twilio que recibió la llamada. PayFlow lo
compara con `provider_phone_id`/`routing_phone` y resuelve el negocio.

Para la primera versión se requiere **una ruta Twilio exclusiva por negocio**.
El cliente puede conservar su número público y configurar con su operador un
desvío hacia esa ruta. Compartir un único número Twilio entre varios negocios
no permite determinar de forma confiable cuál número original fue llamado.

## Despliegue en Railway

1. Crea un proyecto desde este repositorio.
2. En el servicio elige `Settings > Source > Root Directory` y escribe
   `/services/voice-runtime`.
3. Genera un dominio público de Railway.
4. Copia `.env.example` como variables del servicio y completa los secretos.
5. Espera a que `GET /health` responda `200`.
6. En el número Twilio configura **A call comes in** como webhook `POST` a:
   `https://DOMINIO-RAILWAY/twilio/voice`.
7. En Twilio acepta los términos/adenda de IA de ConversationRelay antes de
   realizar la prueba.

El valor `VOICE_RUNTIME_WEBHOOK_SECRET` debe coincidir exactamente con el de
Vercel. `VOICE_SESSION_SECRET` debe ser distinto y existir sólo en Railway.

## Flujo de una llamada

1. Twilio llama a `/twilio/voice` y su firma se valida.
2. El runtime pide a PayFlow el contexto del negocio mediante HMAC.
3. ConversationRelay transmite texto de la conversación por WebSocket.
4. El modelo sólo recibe configuración no secreta y productos publicados.
5. Los pedidos usan UUID de producto; Supabase recalcula precio e inventario.
6. Todos los eventos se guardan con clave idempotente.
7. Una transferencia humana vuelve a Twilio mediante el `action` firmado.

## Pagos y WhatsApp

La voz nunca recibe datos de tarjeta ni declara pagos aprobados. La creación
del pedido queda lista para que PayFlow genere el cobro con Stripe/PayPhone y
lo envíe por la conexión WhatsApp del mismo negocio. Los webhooks oficiales
son los únicos que pueden marcar un pago como exitoso.
