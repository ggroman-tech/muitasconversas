"use client";

import { useActionState, useState, useTransition } from "react";
import { CONSENT_PURPOSES, type ConsentPurpose } from "@/lib/auth/consents";
import type { SignupConfig } from "@/lib/auth/database.types";
import { formatBRL } from "@/lib/auth/format";
import styles from "@/lib/auth/ui.module.css";
import { checkCep, submitSignup, type SignupState } from "./actions";

const AREAS = [
  "Leme / Copacabana",
  "Glória / Catete / Flamengo / Laranjeiras",
  "Botafogo / Humaitá / Urca",
  "Ipanema / Arpoador / Leblon",
  "Lagoa / Jardim Botânico / Gávea",
  "São Conrado",
];

const initial: SignupState = { errors: {}, nonce: 0 };

function Field(props: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "text";
  defaultValue?: string;
  maxLength?: number;
  onBlur?: (v: string) => void;
}) {
  const { id, label, error, hint, required, onBlur, ...rest } = props;
  const describedBy = [hint ? `${id}-dica` : "", error ? `${id}-erro` : ""].filter(Boolean).join(" ");
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? "" : " (opcional)"}
      </label>
      <input
        id={id}
        name={id}
        className={styles.input}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onBlur={onBlur ? (e) => onBlur(e.currentTarget.value) : undefined}
        {...rest}
      />
      {hint ? (
        <span id={`${id}-dica`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <p id={`${id}-erro`} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignupForm({ email, config }: { email: string; config: SignupConfig }) {
  const [state, action, pending] = useActionState(submitSignup, initial);
  const [cepStatus, setCepStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startTransition] = useTransition();
  const v = state.values;
  const e = state.errors;

  function onCepBlur(value: string) {
    if (!value.trim()) return setCepStatus(null);
    startTransition(async () => setCepStatus(await checkCep(value)));
  }

  return (
    <form action={action} className={styles.form} key={state.nonce} noValidate>
      <input type="hidden" name="consent_version" value={config.consent_version} />

      {state.formError ? (
        <p role="alert" className={styles.errorBox}>
          {state.formError}
        </p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Seus dados</legend>
        <div className={styles.field}>
          <span className={styles.label}>E-mail</span>
          <span>{email}</span>
          <span className={styles.hint}>E-mail confirmado pelo link de acesso.</span>
        </div>
        <Field id="full_name" label="Nome completo" required autoComplete="name" defaultValue={v?.full_name} error={e.full_name} />
        <Field
          id="whatsapp"
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={v?.whatsapp}
          hint="Com DDD. Ex.: (21) 99999-0000"
          error={e.whatsapp}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Endereço de entrega</legend>
        <p className={styles.hint}>Entregamos aos sábados, somente na Zona Sul do Rio, nas áreas atendidas.</p>
        <ul className={styles.chips} aria-label="Bairros atendidos">
          {AREAS.map((a) => (
            <li key={a} className={styles.chip}>
              {a}
            </li>
          ))}
        </ul>
        <Field
          id="cep"
          label="CEP"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={9}
          defaultValue={v?.cep}
          onBlur={onCepBlur}
          error={e.cep}
        />
        {cepStatus && !e.cep ? (
          <p role="status" className={cepStatus.ok ? undefined : styles.error}>
            {cepStatus.message}
          </p>
        ) : null}
        <div className={`${styles.row} ${styles.row3}`}>
          <Field id="number" label="Número" required autoComplete="off" defaultValue={v?.number} error={e.number} />
          <Field id="street" label="Rua" required autoComplete="address-line1" defaultValue={v?.street} error={e.street} />
        </div>
        <div className={`${styles.row} ${styles.row2}`}>
          <Field id="complement" label="Complemento" autoComplete="address-line2" defaultValue={v?.complement} />
          <Field id="reference" label="Ponto de referência" defaultValue={v?.reference} hint="Ajuda o entregador." />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset} aria-describedby={e.consents ? "consents-erro" : undefined}>
        <legend className={styles.legend}>Regras e consentimentos</legend>
        <details className={styles.details}>
          <summary>Resumo das regras</summary>
          <ul className={styles.list} style={{ marginTop: 8 }}>
            <li>Assinatura de 30 dias: {formatBRL(config.plan_price_cents)}.</li>
            <li>
              {config.max_open_loans === 1
                ? "Um livro por vez, "
                : `Até ${config.max_open_loans} livros por vez, `}
              com prazo de {config.loan_days} dias.
            </li>
            <li>Entregas e coletas aos sábados (um único sábado de troca para todos), em janelas por região.</li>
            {config.renewal_allowed ? <li>Renovação permitida.</li> : <li>Não há renovação automática: devolva no prazo.</li>}
            {config.late_fee_cents != null && config.late_fee_cents > 0 ? (
              <li>Multa por atraso: {formatBRL(config.late_fee_cents)}.</li>
            ) : (
              <li>Não há multa por atraso, mas com um livro atrasado você não reserva nem recebe outro até devolvê-lo.</li>
            )}
          </ul>
        </details>
        {(Object.keys(CONSENT_PURPOSES) as ConsentPurpose[]).map((key) => (
          <div className={styles.checkRow} key={key}>
            <input
              id={`consent_${key}`}
              name={`consent_${key}`}
              type="checkbox"
              className={styles.check}
              defaultChecked={v?.[`consent_${key}`] === "on"}
              required={CONSENT_PURPOSES[key].required}
            />
            <label htmlFor={`consent_${key}`}>{CONSENT_PURPOSES[key].label}</label>
          </div>
        ))}
        {e.consents ? (
          <p id="consents-erro" role="alert" className={styles.error}>
            {e.consents}
          </p>
        ) : null}
      </fieldset>

      <div>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? "Enviando…" : "Criar minha assinatura"}
        </button>
        <p className={styles.hint} style={{ marginTop: 8 }}>
          O pagamento é feito em seguida, por Pix ou cartão de crédito (em breve).
        </p>
      </div>
    </form>
  );
}
