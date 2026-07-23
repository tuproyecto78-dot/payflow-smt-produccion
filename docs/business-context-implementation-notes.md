# Implementación de la capa de contexto del negocio

La implementación separa dos responsabilidades:

- `business-context-server.ts` carga los datos reales del tenant desde Supabase.
- `business-context-contract.ts` construye respuestas y reglas reutilizables sin depender de un negocio específico.

El motor del simulador carga siempre el contexto completo antes de responder. Las consultas de catálogo, promociones y pagos se responden de forma determinista con los datos reales. Las demás conversaciones usan Gemini con instrucciones construidas a partir del contexto del negocio.

La salida final se sanea para impedir menciones de la plataforma tecnológica. El modo automático permanece bloqueado y el simulador registra `payments_executed=false` y `whatsapp_sent=false`.
