"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CONSENT_PURPOSES, type ConsentPurpose } from "@/lib/auth/consents";
import type { SignupConfig } from "@/lib/auth/database.types";
import { formatCep } from "@/lib/auth/cep";
import { formatBRL } from "@/lib/auth/format";
import { formatPhoneBr } from "@/lib/auth/masks";
import { validateField, type SignupFields } from "@/lib/auth/signup-validation";
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
  /** Formata enquanto digita (só quando o cursor está no fim, para não atrapalhar edição no meio). */
  mask?: (v: string) => string;
  /** Se informado, valida ao sair do campo e mostra o erro na hora. */
  validateAs?: keyof SignupFields;
}) {
  const { id, label, error, hint, required, onBlur, mask, validateAs, ...rest } = props;
  const [liveError, setLiveError] = useState<string | null>(null);
  const shownError = error ?? liveError ?? undefined;
  const describedBy = [hint ? `${id}-dica` : "", shownError ? `${id}-erro` : ""].filter(Boolean).join(" ");
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
        aria-invalid={shownError ? true : undefined}
        aria-describedby={describedBy || undefined}
        onInput={
          mask
            ? (e) => {
                const el = e.currentTarget;
                if (el.selectionStart === el.value.length) {
                  const f = mask(el.value);
                  if (f !== el.value) el.value = f;
                }
                if (liveError) setLiveError(null);
              }
            : liveError
              ? () => setLiveError(null)
              : undefined
        }
        onBlur={(e) => {
          const v = e.currentTarget.value;
          if (validateAs) setLiveError(v.trim() || required ? validateField(validateAs, v) : null);
          onBlur?.(v);
        }}
        {...rest}
      />
      {hint ? (
        <span id={`${id}-dica`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {shownError ? (
        <p id={`${id}-erro`} role="alert" className={styles.error}>
          {shownError}
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

  // Depois de uma resposta com erro, leva o foco ao primeiro campo com problema (o formulário é remontado a cada envio).
  useEffect(() => {
    if (state.nonce === 0) return;
    const el = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
    if (el) el.focus();
    else if (state.formError) document.querySelector<HTMLElement>('form [role="alert"]')?.scrollIntoView({ block: "center" });
  }, [state]);

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
        <Field id="full_name" label="Nome completo" required autoComplete="name" defaultValue={v?.full_name} error={e.full_name} validateAs="full_name" />
        <Field
          id="whatsapp"
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={v?.whatsapp}
          hint="Com DDD. Ex.: (21) 99999-0000"
          error={e.whatsapp}
          mask={formatPhoneBr}
          validateAs="whatsapp"
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
          mask={formatCep}
          validateAs="cep"
          hint="Só os números; já conferimos se entregamos no seu endereço."
        />
        {cepStatus && !e.cep ? (
          <p role="status" aria-live="polite" className={cepStatus.ok ? undefined : styles.error}>
            {cepStatus.message}
          </p>
        ) : null}
        <div className={`${styles.row} ${styles.row3}`}>
          <Field id="number" label="Número" required autoComplete="off" defaultValue={v?.number} error={e.number} validateAs="number" />
          <Field id="street" label="Rua" required autoComplete="address-line1" defaultValue={v?.street} error={e.street} validateAs="street" />
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
            <li>Assinatura mensal: {formatBRL(config.plan_price_cents)} por mês.</li>
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
          O pagamento é feito em seguida, por cartão de crédito, no Mercado Pago.
        </p>
      </div>
    </form>
  );
}
