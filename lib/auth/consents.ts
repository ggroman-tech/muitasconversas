/**
 * Finalidades de consentimento gravadas em `consents` (versão vem de
 * settings.consent_version, entregue por signup_config()).
 * Os TEXTOS jurídicos definitivos são pendência do dono: aqui ficam só rótulos.
 */
export const CONSENT_PURPOSES = {
  privacy_policy: {
    required: true,
    label: "Li e concordo com o tratamento dos meus dados pessoais para a prestação do serviço (LGPD).",
  },
  service_rules: {
    required: true,
    label: "Li e aceito as regras de empréstimo e entrega.",
  },
  marketing_email: {
    required: false,
    label: "Quero receber novidades e convites por e-mail (opcional).",
  },
} as const;

export type ConsentPurpose = keyof typeof CONSENT_PURPOSES;
export const CONSENT_KEYS = Object.keys(CONSENT_PURPOSES) as ConsentPurpose[];
