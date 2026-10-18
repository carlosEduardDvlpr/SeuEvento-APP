import type { GalleryImage } from '@chacara/shared';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, ImageIcon } from '@/components/icons';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import landing from './landing.module.css';
import styles from './GallerySection.module.css';

/**
 * Galeria de festas já realizadas (§13.1, item 3).
 *
 * Mosaico com proporções variadas, e o clique abre visualização ampliada com
 * navegação por teclado. A §13.1 pede fotos **reais**: sem imagem cadastrada, a
 * seção não aparece — um mosaico de blocos de cor não mostra festa nenhuma.
 */

export type GallerySectionProps = {
  images: GalleryImage[];
};

/**
 * A ampliação usa `<dialog>` nativo.
 *
 * Fica aqui, e não no `components/Dialog`, porque aquele tem cabeçalho e rodapé
 * de formulário — o que esta tela precisa é a foto ocupando o espaço. O que se
 * aproveita do elemento nativo é o essencial: foco preso, Escape e backdrop
 * inerte de graça (§18.1).
 */
function Lightbox({
  images,
  index,
  onClose,
  onMove,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onMove: (next: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const image = images[index];

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  /*
   * Setas andam pelas fotos (§13.1). O Escape já vem do `<dialog>`, então não
   * é tratado aqui — reimplementá-lo criaria dois caminhos para a mesma coisa.
   */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') onMove((index + 1) % images.length);
    if (event.key === 'ArrowLeft') onMove((index - 1 + images.length) % images.length);
  }

  if (!image) return null;

  return (
    <dialog
      ref={ref}
      className={styles.lightbox}
      onKeyDown={handleKeyDown}
      aria-label={`Foto ${index + 1} de ${images.length}`}
    >
      <div className={styles.lightboxBar}>
        {/*
          `aria-live` porque as setas trocam a foto sem mudar mais nada que seja
          anunciado: sem isto, quem usa leitor de tela aperta a seta e não ouve
          diferença nenhuma (§18.1).
        */}
        <p className={styles.lightboxCount} aria-live="polite">
          {index + 1} de {images.length}
        </p>

        <button
          type="button"
          className={styles.lightboxButton}
          onClick={onClose}
          aria-label="Fechar"
        >
          <CloseIcon size={24} />
        </button>
      </div>

      <img className={styles.lightboxImage} src={image.url} alt={image.alt} />

      {image.caption ? <p className={styles.lightboxCaption}>{image.caption}</p> : null}

      {images.length > 1 ? (
        <div className={styles.lightboxNav}>
          <button
            type="button"
            className={styles.lightboxButton}
            onClick={() => onMove((index - 1 + images.length) % images.length)}
            aria-label="Foto anterior"
          >
            <ArrowLeftIcon size={24} />
          </button>

          <button
            type="button"
            className={styles.lightboxButton}
            onClick={() => onMove((index + 1) % images.length)}
            aria-label="Próxima foto"
          >
            <ArrowRightIcon size={24} />
          </button>
        </div>
      ) : null}
    </dialog>
  );
}

export function GallerySection({ images }: GallerySectionProps) {
  const [open, setOpen] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <section className={landing.section} aria-labelledby="titulo-galeria">
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-galeria">
            Festas que já aconteceram aqui
          </h2>
          <p className={landing.lead}>
            Fotos de festas de verdade na chácara. Toque para ver maior.
          </p>
        </div>

        {/*
          Mosaico com proporções variadas (§13.1): a cada três fotos uma ocupa o
          dobro, o que quebra a grade regular sem precisar de tamanho por foto.
        */}
        <ul className={[landing.body, styles.mosaic].join(' ')}>
          {images.map((image, index) => (
            <li
              key={image.id}
              className={[styles.cell, index % 3 === 0 ? styles.cellWide : null]
                .filter(Boolean)
                .join(' ')}
            >
              <button type="button" className={styles.thumb} onClick={() => setOpen(index)}>
                {/*
                  A §18.2 pede `srcset`, e aqui não há o que oferecer: o painel
                  guarda **uma** URL por foto (§8, `GalleryImage.url`), então não
                  existem variantes de largura para o navegador escolher. Escrever
                  `srcset` com a mesma URL em vários tamanhos seria mentira para o
                  navegador — ele baixaria o arquivo grande achando que é o médio.
                  O que dá para fazer sem variantes está feito: proporção reservada
                  no CSS (sem salto de layout), `loading="lazy"` fora da primeira
                  tela e decodificação assíncrona. Variantes de verdade exigem
                  processar a imagem no envio, o que a §22 deixa para depois.
                */}
                <img src={image.url} alt={image.alt} loading="lazy" decoding="async" />

                {image.caption ? <span className={styles.caption}>{image.caption}</span> : null}

                <span className={styles.zoom} aria-hidden="true">
                  <ImageIcon size={20} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open !== null ? (
        <Lightbox
          images={images}
          index={open}
          onClose={() => setOpen(null)}
          onMove={(next) => setOpen(next)}
        />
      ) : null}
    </section>
  );
}
