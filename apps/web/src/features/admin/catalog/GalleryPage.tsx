import { useState } from 'react';
import {
  type AdminGalleryImage,
  GALLERY_KIND_LABELS,
  GALLERY_KINDS,
  type GalleryKind,
  createGalleryImageBodySchema,
} from '@chacara/shared';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Select } from '@/components/Select';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import {
  useAdminGallery,
  useCreateGalleryImage,
  useDeleteGalleryImage,
  useReorderGallery,
  useUpdateGalleryImage,
} from '@/api/catalog';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';
import galleryStyles from './GalleryPage.module.css';

/**
 * Galeria de fotos (§13).
 *
 * Organizada por seção, e não numa lista única, porque a ordem só faz sentido
 * dentro da seção: a capa tem uma sequência, as festas realizadas têm outra.
 *
 * A reordenação é por botões subir/descer em vez de arrastar. Arrastar exige
 * alternativa de teclado para ser acessível (§18.1), e o botão **é** essa
 * alternativa — implementar os dois seria trabalho dobrado para o mesmo
 * resultado.
 */

type FormState = {
  kind: GalleryKind;
  url: string;
  alt: string;
  caption: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  kind: 'EVENTS',
  url: '',
  alt: '',
  caption: '',
  active: true,
};

export function GalleryPage() {
  const { showToast } = useToast();
  const gallery = useAdminGallery();

  const createImage = useCreateGalleryImage();
  const updateImage = useUpdateGalleryImage();
  const deleteImage = useDeleteGalleryImage();
  const reorder = useReorderGallery();

  const [editing, setEditing] = useState<AdminGalleryImage | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminGalleryImage | null>(null);

  const saving = createImage.isPending || updateImage.isPending;

  function openCreate(kind: GalleryKind) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, kind });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(image: AdminGalleryImage) {
    setEditing(image);
    setForm({
      kind: image.kind,
      url: image.url,
      alt: image.alt,
      caption: image.caption ?? '',
      active: image.active,
    });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    const { data, errors: invalid } = validateForm(createGalleryImageBodySchema, {
      kind: form.kind,
      url: form.url,
      alt: form.alt,
      caption: form.caption,
      active: form.active,
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateImage.mutateAsync({ id: editing.id, body: data });
      } else {
        await createImage.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Imagem salva.' : 'Imagem adicionada.');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      await deleteImage.mutateAsync(removing.id);
      setRemoving(null);
      showToast('Imagem excluída.');
    } catch (error) {
      setRemoving(null);
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  /**
   * Troca a imagem de posição dentro da seção.
   *
   * Manda a lista completa da seção, que é o que a API exige: assim uma aba
   * desatualizada é recusada em vez de jogar a imagem nova para a posição zero.
   */
  async function move(images: AdminGalleryImage[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;

    const ids = images.map((image) => image.id);
    const moved = ids[index];
    const replaced = ids[target];
    if (!moved || !replaced) return;

    ids[index] = replaced;
    ids[target] = moved;

    const kind = images[index]?.kind;
    if (!kind) return;

    try {
      await reorder.mutateAsync({ kind, ids });
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não foi possível reordenar.', 'error');
    }
  }

  const bySection = GALLERY_KINDS.map((kind) => ({
    kind,
    images: (gallery.data ?? []).filter((image) => image.kind === kind),
  }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Galeria</h1>
          <p className={styles.subtitle}>
            As fotos da landing, por seção. Toda imagem precisa de uma descrição: é o que quem usa
            leitor de tela ouve, e é o que o Google lê.
          </p>
        </div>
      </header>

      {gallery.isPending ? <Skeleton rows={6} /> : null}

      {gallery.isError ? (
        <p className={styles.formError} role="alert">
          {formErrorMessage(gallery.error)}
        </p>
      ) : null}

      {gallery.data
        ? bySection.map(({ kind, images }) => (
            <section key={kind} className={galleryStyles.section}>
              <div className={styles.header}>
                <div className={styles.heading}>
                  <h2 className={galleryStyles.sectionTitle}>{GALLERY_KIND_LABELS[kind]}</h2>
                  <p className={styles.subtitle}>
                    {images.length === 0
                      ? 'Nenhuma foto nesta seção.'
                      : `${images.length} ${images.length === 1 ? 'foto' : 'fotos'}, na ordem em que aparecem.`}
                  </p>
                </div>

                <Button onClick={() => openCreate(kind)}>
                  <PlusIcon size={20} />
                  Adicionar foto
                </Button>
              </div>

              {images.length > 0 ? (
                <ul className={galleryStyles.list}>
                  {images.map((image, index) => (
                    <li key={image.id} className={galleryStyles.card}>
                      <div className={styles.thumb}>
                        {/* `alt` vazio: a descrição real já está no texto ao lado. */}
                        <img src={image.url} alt="" loading="lazy" decoding="async" />
                      </div>

                      <div className={galleryStyles.cardText}>
                        <p className={galleryStyles.alt}>{image.alt}</p>
                        {image.caption ? (
                          <p className={galleryStyles.caption}>{image.caption}</p>
                        ) : null}
                        {image.active ? null : (
                          <span className={[styles.badge, styles.badgeOff].join(' ')}>
                            Desativada
                          </span>
                        )}
                      </div>

                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => move(images, index, -1)}
                          disabled={index === 0 || reorder.isPending}
                          aria-label={`Subir ${image.alt}`}
                        >
                          <ArrowUpIcon size={20} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => move(images, index, 1)}
                          disabled={index === images.length - 1 || reorder.isPending}
                          aria-label={`Descer ${image.alt}`}
                        >
                          <ArrowDownIcon size={20} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => openEdit(image)}
                          aria-label={`Editar ${image.alt}`}
                        >
                          <PencilIcon size={20} />
                        </button>
                        <button
                          type="button"
                          className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                          onClick={() => setRemoving(image)}
                          aria-label={`Excluir ${image.alt}`}
                        >
                          <TrashIcon size={20} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))
        : null}

      {gallery.data?.length === 0 ? (
        <EmptyState
          title="Nenhuma foto ainda"
          description="A foto é o que faz a pessoa se imaginar na festa. Comece pela capa, com uma imagem da chácara em uso."
          action={
            <Button variant="primary" onClick={() => openCreate('HERO')}>
              <ImageIcon size={20} />
              Adicionar a primeira foto
            </Button>
          }
        />
      ) : null}

      <Dialog
        open={formOpen}
        title={editing ? 'Editar foto' : 'Adicionar foto'}
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

          <Select
            label="Seção"
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value as GalleryKind })}
            error={errors.kind}
          >
            {GALLERY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GALLERY_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>

          <Field
            label="Endereço da imagem"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            error={errors.url}
            help="Começando com https:// ou /."
            autoComplete="off"
            inputMode="url"
          />

          <Field
            label="Descrição da imagem"
            value={form.alt}
            onChange={(event) => setForm({ ...form, alt: event.target.value })}
            error={errors.alt}
            help="O que aparece na foto, para quem não pode vê-la. Ex.: Mesa de doces montada sob o arco de balões."
            autoComplete="off"
          />

          <Field
            label="Legenda"
            value={form.caption}
            onChange={(event) => setForm({ ...form, caption: event.target.value })}
            error={errors.caption}
            help="Opcional, aparece junto da foto na galeria."
            autoComplete="off"
          />

          <div className={styles.checkRow}>
            <input
              id="gallery-active"
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <label htmlFor="gallery-active">Aparece no site</label>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir foto"
        message="A foto sai do site para sempre."
        detail="Se você só quer tirá-la do ar por um tempo, edite a foto e desmarque “Aparece no site”."
        confirmLabel="Excluir foto"
        loading={deleteImage.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
