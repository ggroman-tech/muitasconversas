"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatDateOnly, formatTime, formatWeekday } from "@/lib/auth/format";
import type { ScheduleAddress, ScheduleDay } from "@/lib/schedule/types";
import { scheduleVisit, type ScheduleState } from "./actions";
import styles from "./agendar.module.css";

const initial: ScheduleState = { status: "idle" };

function cutoffText(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduleForm({
  addresses,
  days,
}: {
  addresses: ScheduleAddress[];
  days: ScheduleDay[];
}) {
  const [state, action, pending] = useActionState(scheduleVisit, initial);
  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? "",
  );
  const areaId = addresses.find((a) => a.id === addressId)?.area_id;

  if (state.status === "ok") {
    return (
      <div role="status" className={styles.done}>
        <h2 className="h">Agendado</h2>
        <p>{state.message}</p>
        <div className="row">
          <Link href="/conta" className="btn2">
            Voltar para Minha conta
          </Link>
          <Link href="/catalogo" className="btn2">
            Continuar no catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className={styles.steps}>
      {state.status === "error" ? (
        <p role="alert" className="alert">
          {state.message}
        </p>
      ) : null}

      <fieldset className={`card ${styles.fieldset}`}>
        <legend>Sábado e horário</legend>
        <div className={styles.fieldsetBody}>
          {days.map((d) => {
            const wins = d.windows.filter((w) => w.area_id === areaId);
            return (
              <div key={d.day} className={styles.day}>
                <div className={styles.dayHead}>
                  <p className={styles.dayName}>
                    {formatWeekday(d.day)}, {formatDateOnly(d.day)}
                  </p>
                  <p className={styles.hint}>
                    Pedidos até {cutoffText(d.cutoff_at)}.
                  </p>
                </div>
                {d.already_scheduled ? (
                  <p>
                    Você já tem uma visita neste sábado. Para mudar, cancele a
                    atual em Minha conta.
                  </p>
                ) : wins.length === 0 ? (
                  <p>
                    Ainda não há horário para o bairro deste endereço neste
                    sábado.
                  </p>
                ) : (
                  <div className={styles.options}>
                    {wins.map((w) => (
                      <label key={w.window_id} className={styles.option}>
                        <input
                          type="radio"
                          name="window_id"
                          value={w.window_id}
                          disabled={w.full}
                          required
                        />
                        <span className={styles.optionText}>
                          Das {formatTime(w.starts_at)} às{" "}
                          {formatTime(w.ends_at)} — {w.area_name}
                          {w.full ? " (lotada)" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={`card ${styles.fieldset}`}>
        <legend>Endereço</legend>
        <div className={styles.fieldsetBody}>
          <div className={styles.addressList}>
            {addresses.map((a) => (
              <label key={a.id} className={styles.option}>
                <input
                  type="radio"
                  name="address_id"
                  value={a.id}
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  required
                />
                <span className={styles.optionText}>
                  <span>
                    {a.street}, {a.number}
                    {a.complement ? ` — ${a.complement}` : ""}
                  </span>
                  <span className={styles.optionSub}>
                    {a.area_name} — CEP{" "}
                    {a.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className={`field ${styles.noteField}`}>
            <label htmlFor="note">
              Recado para quem for ao seu endereço (opcional)
            </label>
            <textarea id="note" name="note" rows={3} maxLength={500} />
            <span className={styles.hint}>
              Ex.: deixar com o porteiro. Até 500 caracteres.
            </span>
          </div>
        </div>
      </fieldset>

      <div className={styles.summary}>
        <p>
          <strong>Sem multa e sem renovação automática.</strong> Você pode
          cancelar a visita em Minha conta até as 08h da sexta-feira.
        </p>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Agendando…" : "Agendar"}
        </button>
      </div>
    </form>
  );
}
