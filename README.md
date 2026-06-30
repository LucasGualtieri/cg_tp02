# Trabalho Prático de Computação Gráfica — TP02

Aplicação web (Vite + TypeScript) que rasteriza primitivas gráficas diretamente
em uma matriz de pixels sobre um `<canvas>`. O TP01 implementou retas (DDA e
Bresenham), circunferência (Bresenham), recorte (Cohen-Sutherland e
Liang-Barsky) e transformações geométricas 2D. Este TP02 estende o projeto com
**duas curvas paramétricas vistas em sala**:

- **Curva de Bézier**, avaliada pelo **algoritmo de De Casteljau**;
- **Curva de Hermite cúbica**.

> 📄 **Documentação completa do TP02:** [`docs/curvas-parametricas.pdf`](docs/curvas-parametricas.pdf)
> (ou [`docs/curvas-parametricas.html`](docs/curvas-parametricas.html)) contém a
> organização do código, o modelo matemático detalhado de cada curva (com as
> deduções e propriedades), o esquema de refinamento/amostragem e o manual de
> uso. Este README resume o essencial; consulte o documento para os detalhes.

## Requisitos

- Node.js 18+
- npm

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

3. Abra no navegador a URL mostrada no terminal.

> **macOS:** se o build acusar *"library load disallowed by system policy"* no
> `lightningcss`, remova a quarentena do binário nativo:
> `xattr -dr com.apple.quarantine node_modules/lightningcss-darwin-arm64/`.

## Comandos úteis

```bash
npm run dev       # roda o projeto localmente
npm run build     # checagem de tipos (tsc) + build de produção
npm run preview   # abre uma prévia local do build
```

## Organização do código

Todo o código fonte vive em `src/`, com responsabilidades separadas por módulo:

| Módulo | Responsabilidade |
| --- | --- |
| `types.ts` | Tipos compartilhados: `Point`, `VectorIJ`, `Color`, `Rect`, `Tool`, `UIState`. |
| `Algorithms.ts` | Algoritmos puros de rasterização e geometria (retas, círculo, recorte e **as curvas paramétricas**). Recebem um `PixelWriter` e não conhecem o canvas. |
| `Homogeneous2D.ts` | Matrizes homogêneas 3×3 (rotação, escala, translação) e suas operações. |
| `CanvasManager.ts` | Dono do buffer de pixels: `setPixel`, limpeza, grade e conversão tela → coordenadas lógicas. |
| `InputHandler.ts` | Traduz eventos de mouse/toque em coordenadas de pixel do canvas. |
| `UIManager.ts` | Constrói a barra lateral, emite o `UIState` e dispara callbacks (`onFinishCurve`, `onClear`). |
| `main.ts` | Orquestrador: lista de primitivas, fluxo de cliques, pipeline de transformação e laço de redesenho. |

Fluxo de uma curva: clique (`InputHandler`) → coordenada lógica
(`CanvasManager`) → acumulada em `curveControlPoints` (`main.ts`) →
`finishCurve()` vira uma primitiva `{ type: "curve", kind, controlPoints }` →
a cada quadro, os pontos de controle são transformados (`Homogeneous2D`) e
passados para `drawBezier`/`drawHermite` (`Algorithms.ts`), que amostram a
curva e a rasterizam reutilizando `drawLineBresenham` do TP01.

## Funcionalidades

### Primitivas (TP01)

- **Point**: adiciona pontos com um clique.
- **Line DDA**: desenha uma reta com dois cliques.
- **Line Bresenham**: desenha uma reta com dois cliques.
- **Circle**: define centro e raio com dois cliques (Bresenham).
- **Selection**: cria um retângulo de recorte com dois cliques.

### Curvas paramétricas (TP02)

- **Bézier**: clique para adicionar quantos pontos de controle quiser (≥ 2);
  o polígono de controle é desenhado em tempo real. A curva é avaliada pelo
  **algoritmo de De Casteljau** (sucessivas interpolações lineares entre
  pontos de controle), numericamente estável e geometricamente intuitivo.
- **Hermite cúbica**: definida por dois pontos e duas tangentes, entradas via
  4 cliques (ponto, alça/tangente, ponto, alça/tangente). Usa os polinômios
  de base de Hermite (H₀₀, H₁₀, H₀₁, H₁₁) para interpolar os pontos com as
  tangentes prescritas nas extremidades.
- Ambas reaproveitam a infraestrutura do TP01: a curva é **amostrada** em
  `segments + 1` pontos (parâmetro `t ∈ [0, 1]`) e os pontos consecutivos são
  ligados por `drawLineBresenham`, formando a polilinha que aproxima a curva.
  O *slider* **segments** controla o refinamento da amostragem.

Detalhamento matemático completo (fórmulas, deduções, propriedades de
invariância afim e fecho convexo, tratamento de tangentes sob transformação)
em [`docs/curvas-parametricas.pdf`](docs/curvas-parametricas.pdf).

## Manual de uso

### Desenhando uma curva de Bézier

1. Na barra lateral, em **Tool Selector**, clique em **Bézier**.
2. Clique no canvas para adicionar pontos de controle (≥ 2). O polígono de
   controle (linhas cinza) e os marcadores aparecem em tempo real.
3. Clique em **Finalizar curva** (painel *Curvas Paramétricas*) para confirmar.
4. Ajuste o *slider* **segments** para refinar/suavizar a curva.

### Desenhando uma curva de Hermite

1. Selecione a ferramenta **Hermite**.
2. Dê 4 cliques nesta ordem: **P0** (ponto inicial) → **alça de P0** (define a
   tangente de saída) → **P1** (ponto final) → **alça de P1** (define a
   tangente de chegada).
3. A curva é finalizada automaticamente no 4º clique. As alças aparecem como
   linhas-guia ligando cada ponto à sua tangente.

### Demais controles

- `dx`, `dy`, `angle`, `sx`, `sy` (painel **Transformations**): translação,
  rotação e escala aplicadas a toda a cena, inclusive às curvas.
- **Cohen-Sutherland** e **Liang-Barsky**: algoritmos de recorte (linhas).
- **pixel size**: amplia os blocos lógicos; **Grid**: mostra eixos e origem.
- **Clear Matrix**: limpa o desenho atual, inclusive uma curva em construção.
- Trocar de ferramenta descarta a curva ainda não finalizada.

## Referências e autoria

Os algoritmos foram implementados pelo autor (código comentado em
`src/Algorithms.ts`) com base nas seguintes referências:

1. **P. de Casteljau** (1959/1963), Citroën — algoritmo de subdivisão
   recursiva por interpolação linear para curvas de Bézier.
2. **P. Bézier** — curvas de Bézier e a base de Bernstein.
3. **Foley, J. D.; van Dam, A.; Feiner, S. K.; Hughes, J. F.** — *Computer
   Graphics: Principles and Practice*. Addison-Wesley. (Bases de
   Bézier/Bernstein e de Hermite; matriz de Hermite e condições de contorno.)
4. **Hearn, D.; Baker, M. P.** — *Computer Graphics with OpenGL*. (Amostragem
   e rasterização de curvas paramétricas.)
5. Notas de aula da disciplina de Computação Gráfica, módulo *Curvas
   Paramétricas*.

## Observações

- O projeto usa renderização por pixels no canvas (sem APIs de desenho
  vetorial do navegador).
- O canvas pode ser usado com mouse ou toque.
