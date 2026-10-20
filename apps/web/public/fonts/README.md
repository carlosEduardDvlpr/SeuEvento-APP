# Fontes self-hosted

A §18.2 pede fonte servida pelo próprio domínio: um `<link>` para o Google Fonts
custa uma conexão a mais no caminho crítico e entrega o endereço de quem visita
a um terceiro. Os arquivos estão versionados aqui, e `src/styles/base.css`
declara exatamente estes nomes.

| Arquivo                             | Família            | Peso    | Papel                            |
| ----------------------------------- | ------------------ | ------- | -------------------------------- |
| `parisienne-400.woff2`              | Parisienne         | 400     | Nome da marca e título do hero   |
| `cormorant-garamond-variable.woff2` | Cormorant Garamond | 400–600 | Títulos de seção                 |
| `montserrat-variable.woff2`         | Montserrat         | 400–700 | Texto, lista, tabela, formulário |

## Procedência e licença

Os três arquivos são o subconjunto **latino** servido pelo Google Fonts, que
cobre todo acento do português (U+0000–00FF). Baixar só esse subconjunto é o que
mantém as três famílias em 98 KB somados.

As três são licenciadas sob a [SIL Open Font License 1.1](https://openfontlicense.org),
que permite uso comercial e redistribuição junto do site:

- [Parisienne](https://fonts.google.com/specimen/Parisienne), de Astigmatic.
- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond), de Christian Thalmann.
- [Montserrat](https://fonts.google.com/specimen/Montserrat), de Julieta Ulanovsky e colaboradores.

A OFL pede que a licença acompanhe os arquivos quando redistribuídos. Antes de
publicar, baixe o `OFL.txt` de cada família (está no repositório oficial de cada
uma, em `github.com/google/fonts`) e deixe ao lado destes `woff2`.

## Se um arquivo faltar

O `@font-face` falha em silêncio e a cadeia de fallback assume (Georgia no
título, system-ui no texto, cursiva do sistema na marca). A interface fica
correta em estrutura, só sem a personalidade tipográfica — e o único efeito
colateral é um 404 por família no console.
