# Contexto multiempresa del simulador

Contrato obligatorio del simulador real:

1. Cada mensaje resuelve primero el negocio asociado al flujo.
2. Antes de responder se cargan nombre, tipo, catálogo activo, promociones vigentes, reglas del agente y proveedor de pago.
3. Las respuestas al cliente hablan como el negocio y nunca mencionan la plataforma tecnológica.
4. `Hola` usa la identidad real del negocio.
5. Las consultas de catálogo usan únicamente productos, precios y disponibilidad registrados.
6. Las consultas de promociones usan únicamente promociones registradas.
7. Las consultas de pagos explican la configuración del negocio sin ejecutar cobros ni confirmar pagos.
8. WhatsApp real, pagos reales y modo automático permanecen deshabilitados.
9. No se incorporan nombres de negocios hardcodeados.

Prueba local:

```bash
node --experimental-strip-types --test tests/business-context.test.mjs
```
