# Simulator real: contrato de regresión

Casos obligatorios:

1. `Hola` se clasifica como `greeting`, responde mediante reglas deterministas y no solicita catálogo ni promociones.
2. `¿Qué platos tienen hoy con precios?` se clasifica como `catalog` y consulta únicamente `catalog_products` del cliente.
3. `¿Hay promociones?` se clasifica como `promotion` y consulta únicamente auditorías de promociones usando `metadata.client_id`, con respaldo del onboarding por `entity_type`/`entity_id`.
4. Ninguna consulta o inserción en `audit_logs` usa la columna inexistente `client_id`.
5. WhatsApp y pagos permanecen fuera de este cambio.

Ejecución local:

```bash
node --experimental-strip-types --test tests/simulator-intent.test.mjs
```
