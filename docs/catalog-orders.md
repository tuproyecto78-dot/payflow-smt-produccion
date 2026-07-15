# Catálogo y pedidos

El módulo es opcional y multi-negocio. Cada `client_id` tiene un catálogo en
estado `draft` o `published`; WhatsApp es un canal de notificación y nunca una
dependencia para crear o administrar pedidos.

## Puesta en producción

1. Aplicar primero `20260713000000_critical_platform_hardening.sql`.
2. Aplicar `20260715000000_catalog_orders_module.sql` en Supabase.
3. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` esté configurada sólo en el
   servidor.
4. Abrir `/dashboard/catalogo`, seleccionar un negocio, cargar categorías y
   productos y publicar el catálogo.
5. Validar el enlace `/catalogo/{slug}` y un pedido de prueba antes de
   compartirlo.

La creación de pedidos usa una función transaccional: vuelve a calcular los
precios en PostgreSQL, bloquea inventario, descuenta stock y registra el evento
`order.created`. El `requestId` evita pedidos duplicados cuando el navegador
reintenta una solicitud. Cancelar un pedido repone inventario una sola vez.

## WhatsApp oficial (opcional)

Para activar confirmaciones deben existir:

- `WHATSAPP_PROVIDER=meta` y `WHATSAPP_ACCESS_TOKEN` en el servidor;
- una fila activa en `whatsapp_connections` para el `client_id` del negocio;
- una plantilla aprobada por Meta configurada desde **Catálogo →
  Configuración**.

La plantilla debe tener cuatro parámetros de cuerpo en este orden:

1. nombre del cliente;
2. número del pedido;
3. total y moneda;
4. nombre del negocio.

Si WhatsApp está desconectado o la entrega falla, el pedido permanece creado y
puede operarse normalmente en `/dashboard/pedidos`.

## Integración con flujos

El editor incluye dos acciones con alcance forzado al negocio de la sesión:

- **Buscar en catálogo**: devuelve producto, precio y disponibilidad mediante
  las salidas `found`, `not_found` y `error`.
- **Actualizar pedido**: cambia el estado operativo mediante las salidas `out`
  y `error`.

Los eventos durables `order.created`, `order.status_changed`, `order.paid` y
`stock.low` quedan en `catalog_events` para procesamiento y reintentos del
orquestador.

## Rutas principales

| Ruta | Uso |
| --- | --- |
| `/dashboard/catalogo` | Productos, categorías, publicación e integración |
| `/dashboard/pedidos` | Operación y estados de pedidos/pagos |
| `/catalogo/{slug}` | Catálogo público y carrito |
| `/api/catalog/*` | API autenticada y aislada por negocio |
| `/api/public/catalogs/{slug}/*` | Lectura pública y creación segura de pedido |
