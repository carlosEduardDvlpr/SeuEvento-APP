import { type Address, BRAZIL_STATES, type SessionUser, addressInputSchema } from '@chacara/shared';
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { useUpdateMe } from '@/api/me';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field } from '@/components/Field';
import { Select } from '@/components/Select';
import { useAuth } from '@/features/auth/AuthProvider';
import { lookupCep } from '@/lib/cep';
import { type FieldErrors, apiFieldErrors, validateForm } from '@/lib/form';
import styles from './AddressDialog.module.css';

/**
 * Endereço de entrega do cliente (§9.12, novembro de 2026).
 *
 * É para onde a decoração vai quando a pessoa escolhe a entrega. Um endereço por
 * conta, salvo no perfil (`PATCH /me`): a reserva copia o endereço no envio.
 *
 * O CEP faz o trabalho pesado: com oito números, o ViaCEP devolve rua, bairro,
 * cidade e estado, e o foco vai para o número, que é o que falta. Tudo continua
 * editável, porque o ViaCEP às vezes não conhece a rua (cidade com CEP único) ou
 * a conhece com outro nome, e quem valida é o mesmo schema da API (§12.5).
 *
 * Quem usa monta o diálogo só enquanto ele está aberto, então cada abertura
 * começa do endereço salvo. É o mesmo diálogo no perfil e no pedido de
 * decoração, por isso ele mesmo lê a sessão e grava o resultado nela.
 */
export type AddressDialogProps = {
  onClose: () => void;
  /** Chamado com o usuário já atualizado, antes de o diálogo fechar. */
  onSaved?: (user: SessionUser) => void;
};

type Values = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

type FieldName = keyof Values;

const FIELDS: readonly FieldName[] = [
  'cep',
  'street',
  'number',
  'complement',
  'district',
  'city',
  'state',
];

/** O que a busca do CEP preenche. Número e complemento são da pessoa. */
const FILLED_BY_CEP: readonly string[] = ['street', 'district', 'city', 'state'];

type Lookup = 'idle' | 'searching' | 'not-found' | 'failed';

const LOOKUP_MESSAGES: Record<Lookup, string> = {
  idle: '',
  searching: 'Buscando o endereço…',
  'not-found': 'Não encontramos este CEP. Confira os números ou preencha o endereço.',
  failed: 'Não conseguimos buscar o CEP agora. Preencha o endereço à mão.',
};

function initialValues(address: Address | null): Values {
  return {
    cep: address?.cep ?? '',
    street: address?.street ?? '',
    number: address?.number ?? '',
    complement: address?.complement ?? '',
    district: address?.district ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
  };
}

function isField(name: string): name is FieldName {
  return (FIELDS as readonly string[]).includes(name);
}

/**
 * Erros da API nos campos deste formulário.
 *
 * A API valida o endereço dentro do corpo do `PATCH /me`, então os campos chegam
 * como `address.cep`, `address.street`. O que não for de um campo daqui fica de
 * fora, e a tela mostra a mensagem geral.
 */
function addressFieldErrors(error: unknown): FieldErrors {
  const mapped: FieldErrors = {};

  for (const [field, message] of Object.entries(apiFieldErrors(error))) {
    const name = field.startsWith('address.') ? field.slice('address.'.length) : field;
    if (isField(name) && !mapped[name]) mapped[name] = message;
  }

  return mapped;
}

export function AddressDialog({ onClose, onSaved }: AddressDialogProps) {
  const { user, setUser } = useAuth();
  const updateMe = useUpdateMe();
  const formId = useId();

  const [values, setValues] = useState<Values>(() => initialValues(user?.address ?? null));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup>('idle');

  const formRef = useRef<HTMLFormElement>(null);
  const lookupRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<Element | null>(null);

  /*
   * O foco volta para quem abriu o diálogo (§14.11). O `<dialog>` nativo só faz
   * isso quando fecha pelo `close()`, e aqui ele sai da página quando quem usa
   * desmonta o diálogo. Quem abriu é lido antes do `showModal()`, que roda no
   * efeito do `Dialog`, e devolvido depois de o diálogo sair da página.
   */
  useLayoutEffect(() => {
    triggerRef.current ??= document.activeElement;
  }, []);

  useEffect(
    () => () => {
      lookupRef.current?.abort();

      const trigger = triggerRef.current;
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    },
    [],
  );

  function change(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  /*
   * Só números, e no máximo oito: é o formato que a API guarda (§9.12). Com o
   * oitavo, a busca sai sozinha; a anterior, se ainda estiver no ar, é cancelada
   * para uma resposta atrasada não sobrescrever o CEP novo.
   */
  function changeCep(raw: string) {
    const cep = raw.replace(/\D/g, '').slice(0, 8);
    change('cep', cep);

    lookupRef.current?.abort();
    lookupRef.current = null;

    if (cep.length !== 8) {
      setLookup('idle');
      return;
    }

    const controller = new AbortController();
    lookupRef.current = controller;
    setLookup('searching');

    lookupCep(cep, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;

        if (!found) {
          setLookup('not-found');
          return;
        }

        // CEP novo é endereço novo: rua, bairro, cidade e estado vêm todos dele.
        setValues((current) => ({
          ...current,
          street: found.street,
          district: found.district,
          city: found.city,
          state: found.state ?? '',
        }));
        // O erro de um campo que o CEP acabou de preencher só confundiria.
        setErrors((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([name]) => !FILLED_BY_CEP.includes(name)),
          ),
        );
        setLookup('idle');

        const number = formRef.current?.elements.namedItem('number');
        if (number instanceof HTMLInputElement) number.focus();
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup('failed');
      });
  }

  async function save(event: FormEvent) {
    event.preventDefault();

    const { data, errors: invalid } = validateForm(addressInputSchema, values);
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      const updated = await updateMe.mutateAsync({ address: data });
      setUser(updated);
      onSaved?.(updated);
      onClose();
    } catch (error) {
      const fieldErrors = addressFieldErrors(error);
      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length === 0) {
        setFormError(
          error instanceof ApiError
            ? error.message
            : 'Não conseguimos salvar o endereço. Tente de novo em instantes.',
        );
      }
    }
  }

  return (
    <Dialog
      open
      title="Endereço de entrega"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={updateMe.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={updateMe.isPending}
            loadingLabel="Salvando…"
          >
            Salvar endereço
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} className={styles.form} onSubmit={save} noValidate>
        <p className={styles.lead}>É para onde a decoração vai quando você escolhe a entrega.</p>

        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}

        <div className={styles.cep}>
          <Field
            label="CEP"
            name="cep"
            help="Com o CEP, a gente preenche o resto do endereço."
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={8}
            value={values.cep}
            error={errors.cep}
            onChange={(event) => changeCep(event.target.value)}
          />

          {/* Existe sempre, vazio ou não: região viva que nasce com o texto nem sempre é lida. */}
          <p className={styles.lookup} role="status">
            {LOOKUP_MESSAGES[lookup]}
          </p>
        </div>

        <Field
          label="Rua"
          name="street"
          autoComplete="address-line1"
          value={values.street}
          error={errors.street}
          onChange={(event) => change('street', event.target.value)}
        />

        <div className={styles.row}>
          <Field
            label="Número"
            name="number"
            value={values.number}
            error={errors.number}
            onChange={(event) => change('number', event.target.value)}
          />

          <Field
            label="Complemento (opcional)"
            name="complement"
            autoComplete="address-line2"
            value={values.complement}
            error={errors.complement}
            onChange={(event) => change('complement', event.target.value)}
          />
        </div>

        <Field
          label="Bairro"
          name="district"
          autoComplete="address-level3"
          value={values.district}
          error={errors.district}
          onChange={(event) => change('district', event.target.value)}
        />

        <div className={styles.row}>
          <Field
            label="Cidade"
            name="city"
            autoComplete="address-level2"
            value={values.city}
            error={errors.city}
            onChange={(event) => change('city', event.target.value)}
          />

          <Select
            label="Estado"
            name="state"
            autoComplete="address-level1"
            value={values.state}
            error={errors.state}
            onChange={(event) => change('state', event.target.value)}
          >
            <option value="">Escolha</option>
            {BRAZIL_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Dialog>
  );
}
