# WhatsApp Cloud API en PayFlow

PayFlow incorpora un adaptador nativo basado en la API oficial de Meta y en el análisis
funcional de [`CreativeWarlock/whatsapp-cloud-api-mcp-server`](https://github.com/CreativeWarlock/whatsapp-cloud-api-mcp-server).
No ejecuta ni copia su servidor HTTP: el repositorio revisado usa credenciales globales,
CORS abierto y endpoints sin autenticación, por lo que no ofrece el aislamiento multi-tenant
que necesita PayFlow.

La integración de PayFlow no es un proxy genérico de Graph API. Cada operación tiene una
ruta, un esquema y un permiso explícitos; el token permanece exclusivamente en el backend.

## Cobertura

| Área | Funciones | Ruta |
|---|---|---|
| Mensajería | texto, vista previa URL, respuesta/contexto, plantilla, imagen, video, audio, documento, sticker | `POST /api/whatsapp/send` |
| Interactivos | botones y listas | `POST /api/whatsapp/send` |
| Datos | ubicación y contactos | `POST /api/whatsapp/send` |
| Reacciones | agregar o retirar emoji | `POST /api/whatsapp/send` |
| Estado | marcar leído; recepción y consulta de sent/delivered/read/failed | `/api/whatsapp/messages/mark-read`, `/api/whatsapp/messages/status`, webhook |
| Medios | subir, consultar metadatos y eliminar | `/api/whatsapp/media` |
| Plantillas | listar, crear, actualizar y eliminar | `/api/whatsapp/templates` |
| Perfil | consultar y actualizar perfil comercial | `/api/whatsapp/business-profile` |
| Números | listar, registrar, desregistrar, pedir/verificar código y PIN | `/api/whatsapp/phone-numbers` |
| Flows | listar, consultar, crear, actualizar, subir JSON, publicar, eliminar y enviar | `/api/whatsapp/flows`, `/api/whatsapp/send` |
| Analítica | cuenta, conversaciones y calidad del número | `GET /api/whatsapp/analytics` |
| Webhooks | ver, suscribir/desuscribir WABA; callback firmado | `/api/whatsapp/webhooks/manage`, `/api/whatsapp/webhook` |
| Cuentas | listar, crear, actualizar y eliminar WABA del portafolio | `/api/whatsapp/business-accounts` |

## Permisos

- `operate`: toda sesión activa, siempre limitada al `client_id` propio. Permite enviar,
  marcar leído, consultar y subir medios.
- `manage`: `client_owner`, `admin` o `super_admin`. Permite modificar perfil, medios,
  plantillas y Flows del negocio autorizado.
- `sensitive`: únicamente `super_admin`, con `confirm: true`. Permite registro de números,
  suscripciones de webhook y administración de cuentas comerciales.

Las mutaciones administrativas se escriben en `audit_logs`. Los medios subidos se registran
en `whatsapp_media_assets`, de modo que un negocio no puede consultar o borrar el ID de otro.

## Configuración multi-tenant

Cada negocio necesita una fila activa:

```sql
insert into public.whatsapp_connections (
  client_id, phone_number_id, business_account_id, display_phone, status
) values (
  'CLIENT_ID', 'META_PHONE_NUMBER_ID', 'META_WABA_ID', '+593...', 'active'
);
```

El modelo actual usa un token de usuario de sistema de Meta, guardado en Vercel, con acceso
a los WABA administrados por PayFlow. Los IDs son por negocio; el token nunca se guarda en
Supabase ni se entrega al navegador. Si en el futuro cada negocio aporta su propio token,
debe guardarse en un almacén de secretos cifrado, no en una columna de texto.

Variables:

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_API_VERSION=vXX.0
WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
META_BUSINESS_PORTFOLIO_ID=...  # solo administración WABA
```

`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` y `WHATSAPP_CLIENT_ID` son un fallback opcional
para un único negocio y solo se usan cuando el `client_id` coincide exactamente.

## Ejemplos

Responder un texto:

```json
POST /api/whatsapp/send
{
  "type": "text",
  "phone_number": "+593999999999",
  "message_text": "Tu pedido está listo: https://payflow.example/p/1042",
  "preview_url": true,
  "context_message_id": "wamid.MENSAJE_RECIBIDO"
}
```

Enviar un medio previamente cargado:

```json
{
  "type": "media",
  "phone_number": "+593999999999",
  "media_type": "image",
  "media_id": "META_MEDIA_ID",
  "caption": "Producto disponible"
}
```

Reaccionar (un emoji vacío retira la reacción):

```json
{
  "type": "reaction",
  "phone_number": "+593999999999",
  "message_id": "wamid.MENSAJE",
  "emoji": "✅"
}
```

Subir un archivo usa `multipart/form-data` con campos `file` y, para administradores,
`client_id`. PayFlow admite hasta 20 MB en esta ruta; el límite real de Vercel y de Meta
puede ser menor según el tipo de archivo y el plan de despliegue.

Crear una plantilla:

```json
POST /api/whatsapp/templates
{
  "name": "pedido_listo",
  "language": "es",
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "Hola {{1}}, tu pedido {{2}} está listo." }
  ]
}
```

Publicar un Flow requiere confirmación:

```json
POST /api/whatsapp/flows
{ "action": "publish", "flow_id": "META_FLOW_ID", "confirm": true }
```

Enviar un Flow publicado valida primero que pertenezca al WABA emisor:

```json
POST /api/whatsapp/send
{
  "type": "flow",
  "phone_number": "+593999999999",
  "flow_id": "META_FLOW_ID",
  "flow_token": "pedido-1042",
  "flow_cta": "Completar pedido",
  "body_text": "Confirma los datos de tu pedido.",
  "flow_action": "navigate",
  "screen": "DATOS_CLIENTE",
  "data": { "order_id": "1042" }
}
```

Analítica diaria:

```http
GET /api/whatsapp/analytics?kind=conversation&start=1784073600&end=1786665600&granularity=DAY
```

## Webhook

Meta debe apuntar a `https://TU_DOMINIO/api/whatsapp/webhook`. La verificación GET usa
`WHATSAPP_VERIFY_TOKEN`; cada POST requiere `X-Hub-Signature-256` validado con
`WHATSAPP_APP_SECRET`. Los estados se guardan de forma idempotente en `messages` y
`message_status_events`.

## Despliegue

1. Aplicar primero `20260713000000_critical_platform_hardening.sql`, luego
   `20260715000000_catalog_orders_module.sql` y finalmente
   `20260716000000_whatsapp_cloud_management.sql`.
2. Crear las conexiones de los negocios en `whatsapp_connections`.
3. Configurar los secretos en Vercel Preview, nunca en variables `NEXT_PUBLIC_*`.
4. Probar capacidades, plantillas, un envío y la firma del webhook con un número de prueba.
5. Probar estados `sent`, `delivered` y `read`, y revisar `audit_logs`.
6. Promover los mismos secretos a Production únicamente después de la validación.
