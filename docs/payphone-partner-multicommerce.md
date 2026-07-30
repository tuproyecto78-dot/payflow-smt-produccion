# PayPhone Partner multi-comercio

Estado: implementación en rama, sin migración aplicada y sin merge.

## Decisiones

- Payflow SMT orquesta pagos; PayPhone procesa el cobro del comercio.
- No existe token PayPhone global.
- Cada `client_id` activo tiene como máximo una cuenta Partner con RUC,
  Store ID, entorno y token de terceros propios.
- El token se cifra con AES-256-GCM antes de persistirlo. La asociación
  `client_id + store_id` forma parte de los datos autenticados del cifrado.
- El token, su texto cifrado y su etiqueta de autenticación no aparecen en
  respuestas, logs ni metadata de auditoría.
- El enlace externo HTTPS del comercio se conserva como fallback.
- Producción tiene un kill switch independiente. Un comercio de producción no
  emite cobros si `PAYPHONE_REAL_CHARGES_ENABLED` no es `true`.

## Variables

```text
PAYPHONE_CREDENTIALS_MASTER_KEY=<32 bytes aleatorios en base64>
PAYPHONE_REAL_CHARGES_ENABLED=false
PAYPHONE_EXTERNAL_NOTIFICATION_SECRET=<secreto aleatorio>
```

El token de terceros y el Store ID no son variables de entorno. Se registran
por negocio mediante el endpoint de onboarding.

## Endpoints

### Onboarding

`POST /api/payphone/partner/onboarding`

Solo `admin` o `super_admin`. Requiere:

```json
{
  "client_id": "uuid-del-negocio",
  "ruc": "1790012345001",
  "store_id": "store-asignado-por-payphone",
  "third_party_token": "<solo-en-la-solicitud>",
  "environment": "sandbox",
  "fallback_url": "https://comercio.example/pagar",
  "external_notification_enabled": true
}
```

La respuesta solo contiene RUC y Store ID enmascarados y
`token_configured: true`.

`GET /api/payphone/partner/onboarding?client_id=<uuid>` devuelve el estado
seguro de la cuenta, sin credenciales.

### Crear enlace

`POST /api/payphone/create-link`

Requiere sesión activa, pertenencia al `client_id` e `Idempotency-Key`.
Resuelve la cuenta del negocio, envía el token de ese negocio únicamente a
PayPhone y persiste una transacción tenant-aware. Si PayPhone falla y existe
`fallback_url`, devuelve ese enlace con `fallback_used: true`.

La ruta heredada `POST /api/payments/create` usa la misma resolución Partner
para `provider: "PayPhone"` y rechaza `client_id` nulo.

### Notificación externa

`POST /api/payphone/NotificacionPago`

Alias canónico de `/api/payphone/webhook`. Valida secreto, Store ID,
`clientTransactionId`, monto y moneda antes de ejecutar la función SQL
transaccional. La respuesta compatible con PayPhone usa:

```json
{ "Response": true, "ErrorCode": "000" }
```

También devuelve `duplicate`, `transition_applied` y `status` para evidencia
operativa. El replay del mismo `TransactionId` es idempotente y los estados
`approved` y `rejected` no pueden sobrescribirse.

### Consultar estado

`GET /api/payphone/partner/transactions/<id>?client_id=<uuid>`

Requiere sesión activa y valida aislamiento por negocio.

## Migración

`supabase/migrations/20260729150000_payphone_partner_multicommerce.sql`

Crea tablas Partner independientes. No borra ni modifica a ciegas las tablas
`external_payment_*` canceladas. La migración debe revisarse y aplicarse
explícitamente en el entorno autorizado antes de habilitar los endpoints.
