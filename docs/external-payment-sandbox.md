# Integración externa de pagos — fase sandbox

## Alcance

Este módulo prueba el ciclo de una solicitud de pago sin crear cobros reales.
Está separado del Agente IA Universal y no importa catálogo, carrito,
promociones, total, WhatsApp ni el módulo legado `src/lib/payments.ts`.

Reglas de la fase:

- el único proveedor permitido es `sandbox`;
- toda solicitud nueva nace en `pending`;
- la creación nunca aprueba ni rechaza un pago;
- solo un webhook HMAC firmado puede cambiar el estado;
- `approved` y `rejected` son estados terminales;
- los eventos son idempotentes;
- el cliente recibe mensajes breves con el nombre del negocio;
- ninguna ruta llama a una API financiera externa.

## Flujo

1. Una sesión activa crea una solicitud de prueba.
2. El servidor guarda el registro en `external_payment_requests`.
3. La respuesta entrega un link y un descriptor de botón.
4. El link permite consultar la solicitud mediante un token no predecible.
5. El sandbox envía un evento firmado al webhook.
6. Supabase guarda el evento y aplica la transición en una sola transacción.
7. La ruta de estado devuelve la confirmación para el cliente.

## Variables de entorno

| Variable | Obligatoria | Ejemplo | Uso |
|---|---:|---|---|
| `EXTERNAL_PAYMENTS_MODE` | Sí | `sandbox` | Impide activar proveedores reales |
| `EXTERNAL_PAYMENTS_SANDBOX_ENABLED` | Sí | `true` | Habilita las rutas de esta fase |
| `EXTERNAL_PAYMENTS_WEBHOOK_SECRET` | Sí | valor aleatorio de 32+ caracteres | Firma HMAC del webhook |
| `EXTERNAL_PAYMENTS_PUBLIC_BASE_URL` | No | `https://preview.example.com` | Base del link; si falta se usa el origen de la petición |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL existente de Supabase | Persistencia |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | clave pública existente | Validación de la sesión |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | secreto existente del servidor | Acceso exclusivo desde las rutas |

No se necesita `PAYPHONE_TOKEN`, credenciales de PlaceToPay ni claves de otro
proveedor. No deben configurarse para esta fase.

## Preparación

1. Aplicar la migración:

   `supabase/migrations/20260728050000_external_payment_sandbox.sql`

2. Configurar las variables anteriores en el entorno de prueba.
3. Reiniciar o desplegar la aplicación.

## Prueba de creación

Con una sesión activa en el navegador, ejecutar:

```js
const created = await fetch("/api/integrations/payments/requests", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    amount: 15,
    currency: "USD",
    description: "Pedido de prueba",
    customer_name: "Cliente Demo",
    order_reference: "ORDER-TEST-001",
    idempotency_key: "payment-test-001"
  })
}).then((response) => response.json());

console.log(created);
```

Resultado esperado:

- HTTP `201`;
- `real_charge: false`;
- `payment.status: "pending"`;
- `payment.paymentLink` con un enlace sandbox;
- `payment.button.label: "Abrir pago de prueba"`;
- `sandbox_test.provider_reference` para construir el evento de prueba.

Repetir exactamente la misma petición devuelve el mismo pago con
`reused: true`. Reutilizar la clave con otro monto devuelve HTTP `409`.

## Prueba del webhook

Construir el cuerpo sin cambiar espacios después de calcular la firma:

```bash
BODY='{"provider":"sandbox","event_id":"event-test-001","payment_request_id":"REEMPLAZAR_ID","provider_reference":"REEMPLAZAR_REFERENCIA","status":"approved","occurred_at":"2026-07-28T12:00:00.000Z"}'
SIGNATURE="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$EXTERNAL_PAYMENTS_WEBHOOK_SECRET" -hex | sed 's/^.* //')"

curl -X POST "$APP_URL/api/integrations/payments/webhooks/sandbox" \
  -H "content-type: application/json" \
  -H "x-payflow-sandbox-signature: sha256=$SIGNATURE" \
  --data "$BODY"
```

Usar `approved`, `rejected` o `pending`. Una firma incorrecta devuelve HTTP
`401`. Repetir el mismo `event_id` devuelve `duplicate: true` y no vuelve a
procesar la transición.

## Consulta del estado

Desde la misma sesión activa:

```js
const status = await fetch(
  `/api/integrations/payments/requests/${created.payment.id}`
).then((response) => response.json());

console.log(status.payment.status);
console.log(status.payment.customerConfirmation);
```

Confirmaciones esperadas:

- pendiente: `La Estancia: tu pago de prueba está pendiente de confirmación.`
- aprobado: `La Estancia: pago de prueba aprobado.`
- rechazado: `La Estancia: el pago de prueba fue rechazado.`

## Próxima fase

Un proveedor real debe implementarse como un adaptador nuevo detrás del mismo
contrato. Antes de activarlo se deben definir credenciales, verificación
oficial del webhook, expiración, reembolsos y conciliación. El cambio de
proveedor no debe modificar el Agente IA Universal.
