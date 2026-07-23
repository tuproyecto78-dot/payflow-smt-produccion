# Casos de prueba obligatorios

- `Hola` → responde con el nombre real del negocio.
- `¿Qué platos tienen hoy con precios?` → lista únicamente catálogo real y precios exactos.
- `Promoción de hoy` → muestra únicamente promociones registradas.
- `Pagos` → responde como el negocio, no confirma cobros y no menciona la plataforma.
- Respuesta general con Gemini → recibe nombre, tipo, catálogo, promociones y reglas del negocio.
- Cualquier salida inesperada con marca de plataforma se reemplaza por la identidad del negocio.
