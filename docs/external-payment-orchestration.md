# Orquestación de métodos de pago por negocio

Payflow SMT coordina solicitudes y estados; no procesa tarjetas ni actúa como
pasarela. Esta fase tiene dos caminos seguros:

1. enlaces HTTPS externos configurados por negocio y confirmados manualmente;
2. un adaptador PayPhone de sandbox/presentación que nunca llama al proveedor.

El módulo está separado del Agente IA Universal, carrito, catálogo,
promociones, total, WhatsApp e interfaz principal.

## Reglas invariantes

- `client_id` es obligatorio y referencia un `client_accounts.id`;
- el negocio debe existir y tener `status = active`;
- cada método pertenece a un solo negocio;
- toda solicitud nace en `pending`;
- `approved` y `rejected` son terminales;
- `real_charge` siempre es `false`;
- la confirmación manual solo admite `super_admin`, `admin` o `client_owner`;
- los `client_operator` pueden consultar y crear, pero no administrar ni
  confirmar;
- no existe webhook público en esta fase;
- ninguna credencial se recibe por API ni se guarda en metadata;
- ninguna respuesta o log incluye tokens, claves o secretos.

## Variables de entorno

| Variable | Valor |
|---|---|
| `EXTERNAL_PAYMENTS_ENABLED` | `true` |
| `EXTERNAL_PAYMENTS_REAL_CHARGES_ENABLED` | `false` |
| `EXTERNAL_PAYMENTS_PUBLIC_BASE_URL` | URL HTTPS del preview |
| `PAYPHONE_ADAPTER_ENABLED` | `true` solo en preview de demostración |
| `PAYPHONE_ADAPTER_MODE` | `sandbox` o `presentation` |
| `SUPABASE_SERVICE_ROLE_KEY` | secreto existente, exclusivamente servidor |

`PAYPHONE_TOKEN` no se utiliza ni debe configurarse. Ningún secreto de pagos
puede usar el prefijo `NEXT_PUBLIC_`.

## Endpoints

| Método | Ruta | Permiso |
|---|---|---|
| `POST` | `/api/integrations/payments/methods` | titular/admin |
| `GET` | `/api/integrations/payments/methods?client_id=...` | usuario autorizado |
| `POST` | `/api/integrations/payments/methods/{id}/deactivate` | titular/admin |
| `POST` | `/api/integrations/payments/requests` | usuario autorizado |
| `GET` | `/api/integrations/payments/requests/{id}?client_id=...` | usuario autorizado |
| `POST` | `/api/integrations/payments/requests/{id}/manual-confirmation` | titular/admin |
| `GET` | `/api/integrations/payments/presentation/payphone/{id}?client_id=...` | usuario autorizado |

Todas las rutas exigen `client_id`; los clientes solo pueden usar el suyo.
Administradores y superadministradores pueden seleccionar un negocio explícito.

## Enlace manual

Registro:

```json
{
  "client_id": "UUID",
  "kind": "manual_link",
  "mode": "manual",
  "display_name": "Link bancario",
  "external_url": "https://payments.example.com/business"
}
```

Creación:

```json
{
  "client_id": "UUID",
  "payment_method_id": "UUID",
  "amount": 15,
  "currency": "USD",
  "order_reference": "ORDER-001",
  "idempotency_key": "manual-payment-001"
}
```

Confirmación manual:

```json
{
  "client_id": "UUID",
  "status": "approved",
  "idempotency_key": "manual-confirm-001",
  "note": "Comprobante revisado"
}
```

La confirmación y su auditoría se escriben atómicamente en Supabase.

## PayPhone presentación

El método admite únicamente `sandbox` o `presentation`. El adaptador genera un
enlace interno autenticado, no usa `fetch`, no lee `PAYPHONE_TOKEN` y no puede
cambiar `real_charge` a `true`. El proveedor real requerirá una fase y un PR
separados.
