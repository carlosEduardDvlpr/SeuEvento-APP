import { useState } from 'react';
import {
  type AdminTheme,
  PALETTE_SIZE,
  type PaletteColor,
  createThemeBodySchema,
} from '@chacara/shared';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { Textarea } from '@/components/Textarea';
import { useToast } from '@/components/Toast';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { useAdminThemes, useCreateTheme, useDeleteTheme, useUpdateTheme } from '@/api/catalog';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';
import themeStyles from './ThemesPage.module.css';

/**
 * Estilos de festa (§13, §15).
 *
 * A paleta tem exatamente 5 cores porque o cartão de estilo da vitrine mapeia
 * `--t1` a `--t5` (§14.3) — uma paleta menor deixaria variável de CSS sem valor.
 * O formulário reflete isso com cinco linhas fixas, em vez de "adicionar cor",
 * que permitiria salvar um estilo que a vitrine não consegue renderizar.
 *
 * O endereço do estilo na vitrine (`slug`) não é editável: ele nasce do nome e
 * fica estável, para renomear não quebrar link compartilhado.
 */

type FormState = {
  name: string;
  tagline: string;
  description: string;
  palette: PaletteColor[];
  coverImageUrl: string;
  sortOrder: string;
  active: boolean;
};

/** Ponto de partida neutro: o dono troca cor por cor, sem campo vazio. */
const STARTER_PALETTE: PaletteColor[] = [
  { name: 'Clara', hex: '#f2eee6' },
  { name: 'Média', hex: '#d8c7a3' },
  { name: 'Destaque', hex: '#a7b8a1' },
  { name: 'Contraste', hex: '#8c6a4f' },
  { name: 'Escura', hex: '#3a3632' },
];

const EMPTY_FORM: FormState = {
  name: '',
  tagline: '',
  description: '',
  palette: STARTER_PALETTE,
  coverImageUrl: '',
  sortOrder: '0',
  active: true,
};

function PaletteSwatches({ palette }: { palette: PaletteColor[] }) {
  return (
    <span className={themeStyles.swatches}>
      {palette.map((color) => (
        // A cor é dado, não decoração: o nome vai no `title` e no texto oculto.
        <span key={`${color.hex}-${color.name}`} className={themeStyles.swatch} title={color.name}>
          <span className={themeStyles.swatchFill} style={{ background: color.hex }} />
          <span className="sr-only">{`${color.name} (${color.hex})`}</span>
        </span>
      ))}
    </span>
  );
}

export function ThemesPage() {
  const { showToast } = useToast();
  const themes = useAdminThemes();

  const createTheme = useCreateTheme();
  const updateTheme = useUpdateTheme();
  const deleteTheme = useDeleteTheme();

  const [editing, setEditing] = useState<AdminTheme | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminTheme | null>(null);

  const saving = createTheme.isPending || updateTheme.isPending;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(theme: AdminTheme) {
    setEditing(theme);
    setForm({
      name: theme.name,
      tagline: theme.tagline ?? '',
      description: theme.description ?? '',
      palette: theme.palette,
      coverImageUrl: theme.coverImageUrl ?? '',
      sortOrder: String(theme.sortOrder),
      active: theme.active,
    });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function setColor(index: number, patch: Partial<PaletteColor>) {
    setForm((current) => ({
      ...current,
      palette: current.palette.map((color, position) =>
        position === index ? { ...color, ...patch } : color,
      ),
    }));
  }

  async function submit() {
    const { data, errors: invalid } = validateForm(createThemeBodySchema, {
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      palette: form.palette,
      coverImageUrl: form.coverImageUrl,
      sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
      active: form.active,
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateTheme.mutateAsync({ id: editing.id, body: data });
      } else {
        await createTheme.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Estilo salvo.' : 'Estilo criado.');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      const result = await deleteTheme.mutateAsync(removing.id);
      setRemoving(null);

      // A API decide entre excluir e desativar; a mensagem precisa dizer qual foi.
      showToast(
        result.outcome === 'deleted'
          ? 'Estilo excluído.'
          : 'Estilo desativado: ele já tem itens ou combos e some da vitrine, mas continua no histórico.',
      );
    } catch (error) {
      setRemoving(null);
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  // O erro da paleta pode vir do array inteiro ou de uma cor específica.
  const paletteError =
    errors.palette ??
    Object.entries(errors).find(([field]) => field.startsWith('palette.'))?.[1] ??
    undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Estilos</h1>
          <p className={styles.subtitle}>
            As linhas estéticas que o cliente escolhe na vitrine. Cada estilo agrupa itens e combos
            e tem uma paleta de cinco cores.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate}>
          <PlusIcon size={20} />
          Novo estilo
        </Button>
      </header>

      {themes.isPending ? <Skeleton rows={5} /> : null}

      {themes.isError ? <p className={styles.formError}>{formErrorMessage(themes.error)}</p> : null}

      {themes.data?.length === 0 ? (
        <EmptyState
          title="Nenhum estilo ainda"
          description="Estilo é a linha estética da festa: Rústico boho, Nuvens e estrelas, Tropical. É por aqui que o cliente filtra os itens na vitrine."
          action={
            <Button variant="primary" onClick={openCreate}>
              Novo estilo
            </Button>
          }
        />
      ) : null}

      {themes.data && themes.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Estilos de festa</caption>
            <thead>
              <tr>
                <th scope="col">Estilo</th>
                <th scope="col">Paleta</th>
                <th scope="col">Endereço</th>
                <th scope="col" className={styles.numeric}>
                  Ordem
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {themes.data.map((theme) => (
                <tr key={theme.id}>
                  <td>
                    <strong>{theme.name}</strong>
                    {theme.active ? null : (
                      <>
                        {' '}
                        <span className={[styles.badge, styles.badgeOff].join(' ')}>
                          Desativado
                        </span>
                      </>
                    )}
                    {theme.tagline ? (
                      <span className={themeStyles.tagline}>{theme.tagline}</span>
                    ) : null}
                  </td>
                  <td>
                    <PaletteSwatches palette={theme.palette} />
                  </td>
                  <td>
                    <code className={themeStyles.slug}>{theme.slug}</code>
                  </td>
                  <td className={styles.numeric}>{theme.sortOrder}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => openEdit(theme)}
                        aria-label={`Editar ${theme.name}`}
                      >
                        <PencilIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                        onClick={() => setRemoving(theme)}
                        aria-label={`Excluir ${theme.name}`}
                      >
                        <TrashIcon size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={formOpen}
        title={editing ? 'Editar estilo' : 'Novo estilo'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Salvando…">
              Salvar
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          {formError ? (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          ) : null}

          <Field
            label="Nome"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={errors.name}
            help={
              editing
                ? `O endereço na vitrine continua /${editing.slug}, mesmo trocando o nome.`
                : 'O endereço na vitrine é criado a partir do nome.'
            }
            autoComplete="off"
          />

          <Field
            label="Frase curta"
            value={form.tagline}
            onChange={(event) => setForm({ ...form, tagline: event.target.value })}
            error={errors.tagline}
            help="Uma linha que resume o clima. Aparece no cartão do estilo."
          />

          <Textarea
            label="Descrição"
            rows={4}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            error={errors.description}
            help="Para que tipo de festa serve e o que compõe o estilo."
          />

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Paleta ({PALETTE_SIZE} cores)</legend>

            {paletteError ? (
              <span className={themeStyles.paletteError} role="alert">
                {paletteError}
              </span>
            ) : null}

            <ul className={themeStyles.paletteList}>
              {form.palette.map((color, index) => (
                <li key={index} className={themeStyles.paletteRow}>
                  <Field
                    label={`Cor ${index + 1}`}
                    type="color"
                    className={themeStyles.colorInput}
                    value={color.hex}
                    onChange={(event) => setColor(index, { hex: event.target.value })}
                  />
                  <Field
                    label="Nome da cor"
                    value={color.name}
                    onChange={(event) => setColor(index, { name: event.target.value })}
                    autoComplete="off"
                  />
                </li>
              ))}
            </ul>
          </fieldset>

          <Field
            label="Imagem de capa"
            value={form.coverImageUrl}
            onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })}
            error={errors.coverImageUrl}
            help="Endereço começando com https:// ou /. Sem foto, o cartão usa um bloco com a paleta."
            autoComplete="off"
            inputMode="url"
          />

          <div className={styles.formRow}>
            <Field
              label="Ordem"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              error={errors.sortOrder}
              help="Menor aparece primeiro."
            />

            <div className={styles.checkRow}>
              <input
                id="theme-active"
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              <label htmlFor="theme-active">Aparece na vitrine</label>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir estilo"
        message={`O estilo "${removing?.name}" sai da vitrine.`}
        detail="Se ele já tiver itens ou combos, em vez de excluir a gente desativa: o histórico das reservas continua explicável."
        confirmLabel="Excluir estilo"
        loading={deleteTheme.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
