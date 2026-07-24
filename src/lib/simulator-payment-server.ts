import "server-only";

import { normalizePaymentProvider } from "./business-context-contract";
import { createServiceRoleClient } from "./supabase";
import type { SimulatorPaymentContext } from "./simulator-payment";

export async function loadSimulatorPaymentContext(input: {
  clientId: string;
}): Promise<SimulatorPaymentContext> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("client_accounts")
    .select("business_name,payment_provider")
    .eq("id", input.clientId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo cargar la configuración de pago: ${error.message}`
    );
  }

  const businessName = String(data?.business_name || "").trim();
  if (!businessName) {
    throw new Error("No se encontró el negocio asociado a esta conversación.");
  }

  return {
    clientId: input.clientId,
    businessName,
    paymentProvider: normalizePaymentProvider(data?.payment_provider),
  };
}
