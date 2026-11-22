/**
 * PONTO DE EXTENSÃO — frente D (Pagar.me, Pix).
 *
 * Depois de signup_customer() a assinatura está 'pending'. A frente D deve
 * implementar aqui a criação do cliente/cobrança no Pagar.me, gravar
 * customers.pagarme_customer_id e subscriptions.pagarme_subscription_id e
 * devolver para onde mandar o assinante (ex.: página/QR do Pix).
 * O webhook (frente D) muda a assinatura para 'active'.
 *
 * Esta frente NÃO chama o Pagar.me nem coleta CPF/documento.
 */
export type StartBillingResult = { redirectTo: string };

export async function startBilling(_subscriptionId: string): Promise<StartBillingResult> {
  void _subscriptionId;
  return { redirectTo: "/assinar/concluir" };
}
