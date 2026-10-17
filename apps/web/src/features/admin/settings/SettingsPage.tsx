import type { UpdateVenueSettingsBody, VenueSettings } from '@chacara/shared';
import { updateVenueSettingsBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { useUpdateVenueSettings, useVenueSettings } from '@/api/admin-customers';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { MoneyField } from '@/components/MoneyField';
import { Skeleton } from '@/components/Skeleton';
import { Textarea } from '@/components/Textarea';
import { useToast } from '@/components/Toast';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import adminStyles from '../admin.module.css';
import styles from './SettingsPage.module.css';

/**
 * Configurações da chácara (§13.4).
 *
 * São os números que governam o resto do sistema, e a tela diz **o efeito** de
 * cada um em vez de só nomeá-lo: "antecedência mínima" não significa nada sozinho,
 * "o cliente só reserva com pelo menos X dias de folga" significa.
 */

/** Campos numéricos editados como texto, para o campo poder ficar vazio. */
type Draft = {
  name: string;
  baseDailyPriceCents: number | null;
  maxGuests: string;
  minDays: string;
  maxDays: string;
  minLeadDays: string;
  freeCancelUntilDays: string;
  holdHours: string;
  maxPendingPerUser: string;
  checkInTime: string;
  checkOutTime: string;
  whatsapp: string;
  address: string;
  mapsUrl: string;
  houseRules: string;
};

function toDraft(settings: VenueSettings): Draft {
  return {
    name: settings.name,
    baseDailyPriceCents: settings.baseDailyPriceCents,
    maxGuests: String(settings.maxGuests),
    minDays: String(settings.minDays),
    maxDays: String(settings.maxDays),
    minLeadDays: String(settings.minLeadDays),
    freeCancelUntilDays: String(settings.freeCancelUntilDays),
    holdHours: String(settings.holdHours),
    maxPendingPerUser: String(settings.maxPendingPerUser),
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    whatsapp: settings.whatsapp ?? '',
    address: settings.address ?? '',
    mapsUrl: settings.mapsUrl ?? '',
    houseRules: settings.houseRules ?? '',
  };
}

/**
 * Campo vazio vira `NaN` de propósito.
 *
 * `Number('')` é zero, e zero é um valor **válido** em alguns destes campos — a
 * antecedência mínima aceita zero. Mandar zero por "deixei em branco" mudaria a
 * regra sem o dono pedir; `NaN` é recusado pelo schema com a mensagem certa.
 */
function toNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function SettingsPage() {
  const settings = useVenueSettings();
  const update = useUpdateVenueSettings();
  const { showToast } = useToast();

  /*
   * O rascunho só existe **enquanto está sendo editado**; `null` quer dizer
   * "mostre o que veio do servidor". Mesmo motivo da anotação interna na T25a:
   * copiar a resposta para o estado a cada releitura apagaria o que está sendo
   * digitado.
   */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (settings.isPending) {
    return (
      <div className={adminStyles.page}>
        <Skeleton rows={8} />
      </div>
    );
  }

  if (settings.isError || !settings.data) {
    return (
      <div className={adminStyles.page}>
        <h1 className={adminStyles.title}>Configurações</h1>
        <p role="alert">{formErrorMessage(settings.error) ?? 'Tente de novo em instantes.'}</p>
      </div>
    );
  }

  const values = draft ?? toDraft(settings.data);
  const set = (changes: Partial<Draft>) => setDraft({ ...values, ...changes });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const body: UpdateVenueSettingsBody = {
      name: values.name,
      baseDailyPriceCents: values.baseDailyPriceCents ?? Number.NaN,
      maxGuests: toNumber(values.maxGuests),
      minDays: toNumber(values.minDays),
      maxDays: toNumber(values.maxDays),
      minLeadDays: toNumber(values.minLeadDays),
      freeCancelUntilDays: toNumber(values.freeCancelUntilDays),
      holdHours: toNumber(values.holdHours),
      maxPendingPerUser: toNumber(values.maxPendingPerUser),
      checkInTime: values.checkInTime,
      checkOutTime: values.checkOutTime,
      whatsapp: values.whatsapp,
      address: values.address,
      mapsUrl: values.mapsUrl,
      houseRules: values.houseRules,
    };

    const validation = validateForm(updateVenueSettingsBodySchema, body);
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      await update.mutateAsync(validation.data);
      // Volta a seguir o servidor: o que foi salvo é a fonte da verdade.
      setDraft(null);
      showToast('Configurações salvas.');
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
      showToast(formErrorMessage(error) ?? 'Não conseguimos salvar.', 'error');
    }
  }

  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Configurações</h1>
          <p className={adminStyles.subtitle}>
            Estes números valem para todo o site: é o que o cliente pode escolher e por quanto.
          </p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formErrorMessage(update.error) ? (
          <p className={styles.problem} role="alert">
            {formErrorMessage(update.error)}
          </p>
        ) : null}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>A chácara</legend>

          <div className={styles.grid}>
            <Field
              label="Nome"
              help="Aparece no site, nos e-mails e no título da página."
              value={values.name}
              error={fieldErrors.name}
              onChange={(event) => set({ name: event.target.value })}
            />

            <MoneyField
              label="Diária base"
              help="Valor de um dia quando nenhuma regra de preço se aplica."
              valueCents={values.baseDailyPriceCents}
              error={fieldErrors.baseDailyPriceCents}
              onChangeCents={(baseDailyPriceCents) => set({ baseDailyPriceCents })}
            />

            <Field
              label="Capacidade"
              help="Máximo de convidados que o cliente pode informar."
              type="number"
              min={1}
              inputMode="numeric"
              value={values.maxGuests}
              error={fieldErrors.maxGuests}
              onChange={(event) => set({ maxGuests: event.target.value })}
            />

            <Field
              label="Entrada"
              help="Horário em que o cliente pode chegar."
              type="time"
              value={values.checkInTime}
              error={fieldErrors.checkInTime}
              onChange={(event) => set({ checkInTime: event.target.value })}
            />

            <Field
              label="Saída"
              help="Horário limite para desocupar."
              type="time"
              value={values.checkOutTime}
              error={fieldErrors.checkOutTime}
              onChange={(event) => set({ checkOutTime: event.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Regras de reserva</legend>

          <div className={styles.grid}>
            <Field
              label="Mínimo de dias"
              help="Menor período que o cliente pode reservar."
              type="number"
              min={1}
              inputMode="numeric"
              value={values.minDays}
              error={fieldErrors.minDays}
              onChange={(event) => set({ minDays: event.target.value })}
            />

            <Field
              label="Máximo de dias"
              help="Maior período seguido."
              type="number"
              min={1}
              inputMode="numeric"
              value={values.maxDays}
              error={fieldErrors.maxDays}
              onChange={(event) => set({ maxDays: event.target.value })}
            />

            <Field
              label="Antecedência mínima"
              help="Em dias. O cliente só reserva com essa folga; zero libera reservar para hoje."
              type="number"
              min={0}
              inputMode="numeric"
              value={values.minLeadDays}
              error={fieldErrors.minLeadDays}
              onChange={(event) => set({ minLeadDays: event.target.value })}
            />

            <Field
              label="Prazo do pedido"
              help="Em horas. Quanto tempo as datas ficam seguras até você responder."
              type="number"
              min={1}
              inputMode="numeric"
              value={values.holdHours}
              error={fieldErrors.holdHours}
              onChange={(event) => set({ holdHours: event.target.value })}
            />

            <Field
              label="Cancelamento pelo cliente"
              help="Em dias antes do início. Depois disso, só você cancela."
              type="number"
              min={0}
              inputMode="numeric"
              value={values.freeCancelUntilDays}
              error={fieldErrors.freeCancelUntilDays}
              onChange={(event) => set({ freeCancelUntilDays: event.target.value })}
            />

            <Field
              label="Pedidos abertos por cliente"
              help="Quantos pedidos aguardando a mesma pessoa pode ter."
              type="number"
              min={1}
              inputMode="numeric"
              value={values.maxPendingPerUser}
              error={fieldErrors.maxPendingPerUser}
              onChange={(event) => set({ maxPendingPerUser: event.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Contato e localização</legend>

          <div className={styles.grid}>
            <Field
              label="WhatsApp"
              help="Aparece no site e nos e-mails. Deixe vazio para esconder."
              type="tel"
              inputMode="tel"
              value={values.whatsapp}
              error={fieldErrors.whatsapp}
              onChange={(event) => set({ whatsapp: event.target.value })}
            />

            <Field
              label="Endereço"
              help="Enviado no e-mail de confirmação."
              value={values.address}
              error={fieldErrors.address}
              onChange={(event) => set({ address: event.target.value })}
            />

            <Field
              label="Link do mapa"
              help="Endereço https do Google Maps. Opcional."
              type="url"
              inputMode="url"
              value={values.mapsUrl}
              error={fieldErrors.mapsUrl}
              onChange={(event) => set({ mapsUrl: event.target.value })}
            />
          </div>

          <Textarea
            label="Regras da casa"
            help="Mostradas antes de enviar o pedido e no e-mail de confirmação."
            rows={4}
            maxLength={2000}
            value={values.houseRules}
            error={fieldErrors.houseRules}
            onChange={(event) => set({ houseRules: event.target.value })}
          />
        </fieldset>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={update.isPending}
            loadingLabel="Salvando…"
            disabled={draft === null}
          >
            Salvar configurações
          </Button>

          {draft === null ? null : (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Desfazer alterações
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
