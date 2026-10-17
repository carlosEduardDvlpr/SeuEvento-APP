# Fontes self-hosted

A §14.4 define **Young Serif** para títulos e **Figtree** para texto, e a §18.2
pede fonte servida pelo próprio domínio: um `<link>` para o Google Fonts custa
uma conexão a mais no caminho crítico e entrega o endereço de quem visita a um
terceiro.

Os arquivos não estão no repositório. Coloque-os aqui com estes nomes exatos,
que são os que `src/styles/base.css` declara:

| Arquivo                  | Fonte                                             |
| ------------------------ | ------------------------------------------------- |
| `young-serif-400.woff2`  | Young Serif, peso 400 (é o único peso da família) |
| `figtree-variable.woff2` | Figtree variável, faixa de peso 400 a 700         |

As duas são licenciadas sob a SIL Open Font License, que permite uso comercial e
redistribuição junto do site. Baixe dos repositórios oficiais das famílias e
mantenha o arquivo de licença ao lado quando o projeto for publicado.

Enquanto os arquivos não estiverem aqui, o `@font-face` falha em silêncio e a
cadeia de fallback assume (Georgia para título, system-ui para texto). A
interface fica correta em estrutura, só sem a personalidade tipográfica — e o
único efeito colateral é um 404 por família no console.
