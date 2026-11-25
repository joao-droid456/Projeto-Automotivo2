# SENAI Automotivo 3D

Simulador educativo de oficina automotiva em JavaScript, HTML, CSS, Three.js e Vite. Funciona localmente, sem backend. Ambiente e veículos exibidos são procedurais e aproximados; medidas e procedimentos precisam de revisão docente.

## Executar

Requer Node.js 24.16 ou versão compatível com o Vite instalado, npm e navegador com WebGL 2.

```sh
npm ci
npm run dev
```

Abra a URL informada pelo Vite. Não abra o HTML diretamente pelo explorador. No PowerShell com bloqueio de `npm.ps1`, utilize `npm.cmd` em todos os comandos.

```sh
npm test
npm run lint
npm run format:check
npm run build
npm run preview
```

O build gera `dist/`, com entradas principal e `comparacao.html`. Sirva essa pasta por HTTP. `predev` e `prebuild` copiam decodificadores locais da versão instalada de Three.js.

ESLint verifica todo o código em src, testes, scripts e configurações. `format` e `format:check` aplicam Prettier aos módulos extraídos, testes e configuração: o estilo dos demais arquivos foi preservado para evitar mudanças apenas estéticas. ESLint e Prettier são dependências de desenvolvimento; nenhuma nova dependência de execução foi adicionada.

## Funcionalidades

**Troca manual de roda:** na janela de inspeção do carro didático, selecione a roda dianteira esquerda e escolha **Trocar roda — interação manual**. Solte os fixadores por gesto, retire a roda por arraste, alinhe/encaixe e fixe novamente nas peças 3D. Veja [passo a passo, arquivos e testes](docs/roda-manual.md).

**Pista externa e carro dirigível:** saia pelo portão ou nasça no pátio, aproxime-se do carro de testes e pressione **E** para dirigir. **W/S** aceleram/freiam e dão ré, **A/D** viram, **ESPAÇO** é o freio de mão — com velocidade e esterço simultâneos o carro derrapa e deixa marcas de pneu no asfalto. A aceleração é progressiva, estilo Need for Speed (0 a 100 km/h em ~7,7 s), e a velocidade máxima é **150 km/h**. **E** novamente devolve o jogador a pé ao lado do carro. O pátio tem pista com zebras e curvas, área verde com árvores e arbustos, cerca e horizonte distante. Veja [arquitetura](docs/arquitetura.md#pátio-pista-e-recorte-por-área).

**Recorte por área:** dentro da oficina o exterior não é desenhado e, fora dela, interior e equipamentos ficam ocultos; na faixa do portão as duas partes aparecem. A troca também ajusta luzes, neblina e alcance da câmera. O `shell` da oficina (paredes, portão, telhado) permanece visível dos dois lados. No pátio a neblina exponencial é densa (estilo Silent Hill): árvores e cerca surgem gradualmente do cinza e o horizonte desaparece; no interior ela fica leve para não atrapalhar as práticas.

**Inspeção e manutenção:** clique/toque no carro para abrir uma janela com o veículo centralizado e a oficina desfocada ao fundo. Passe o mouse nas peças para ver nome/informação e clique para abrir suas ações. No carro didático, há capô, faróis e práticas de roda, filtro, bateria e luzes na própria janela. Gire/aproxime a câmera e use **Voltar à oficina** para retornar. O renderizador é reutilizado e o fundo fica pausado. Veja [ações, limitações, configuração e testes](docs/inspecao.md).

- Oficina procedural, laboratório, equipamentos, materiais locais, batching e instanciamento.
- Pátio externo com pista, área verde, cerca e carro dirigível com derrapagem e marcas de pneu.
- Recorte por área: interior e exterior alternam conforme a posição, reduzindo o custo de renderização.
- Caminhada WASD/setas, mouse, Shift, colisões, pausa e toque.
- Elevadores animados com veículos, colisão conforme altura e bloqueio de descida por ocupação.
- Bancada educativa, destaque de componentes, quiz, visita guiada e missão.
- Montagem de roda; filtro de ar; teste de bateria e luzes.
- Troca de óleo com coletor móvel, ferramentas, travas e perfis didáticos Corolla Hybrid, HB20 e Gol.
- Configurações gráficas, áudio opcional e progresso local sem cadastro.
- Página de comparação com seis câmeras, referências e exportação manual.

Entre em **Mexer no carro** para roda/filtro/bateria/luzes. Para óleo, eleve um carro, aproxime-se do cárter e pressione E. Fora da oficina, use E no carro de testes para dirigir na pista. ESC pausa ou encerra a sessão conforme o estado. No celular, joystick à esquerda e arraste à direita para olhar; ao dirigir, o botão de freio de mão aparece na tela.

O suporte opcional a GLB/Draco/KTX2 e três LOD existe em VehicleFleet. **Os modelos GLB não estão presentes nem habilitados no JSON atual.** Os perfis de óleo não transformam a carroceria em réplica do fabricante. Suspensão e escapamento têm representação visual; não há atividades independentes deles nem lavagem de chassi.

## Organização

```text
src/
  main.js          entrada mínima
  core/            Game, Engine, GameLoop, Controls, CollisionSystem, AreaZones
  graphics/        Renderer, StaticReflections
  machines/        LiftMotion e VehicleMotion (estado sem Three.js)
  world/           cenário, arquitetura, iluminação, materiais, lotes e pátio externo
  objects/         veículos procedurais, carro dirigível, elevadores, equipamentos e adaptadores
  vehicles/        VehicleData, VehicleFleet, materiais, LOD e sombras
  education/       regras de quiz, montagem, serviços e óleo
  systems/         sessões 3D, direção, interação, dados, progresso e áudio
  ui/              HUD, painéis, toque e estilos de atividades
  utils/           descarte compartilhado de recursos
public/            data/ e referencias/
scripts/           auditoria, decodificadores e smoke gráfico
tests/             testes Node e fixture gráfica isolada
docs/              arquitetura, auditoria e guias das práticas
```

## Adicionar funcionalidades

**Carro de testes:** `workshop.json.driving` define `spawn` (x, z) e `heading` (radianos) do veículo no pátio. Pista, zebras, cerca e vegetação derivam das dimensões da oficina em `src/world/OutdoorArea.js`; gráficos veiculares ficam em `src/objects/DrivableCar.js` e a física em `src/machines/VehicleMotion.js`, testada sem navegador.

**Veículo visual:** cadastre em `src/vehicles/VehicleData.js`, disponibilize `public/models/vehicles/<id>/lod0.glb`, `lod1.glb` e `lod2.glb` e inclua uma entrada em `workshop.json.vehicles` com `model`, `position`, `rotation` e `distances` (exemplo `[0,12,28]`). Use metros, Y para cima, Z para frente e origem no piso. Frota visual não acrescenta automaticamente colisões ou manutenção. Para veículos procedurais do elevador, configure `reconstruction.lifts`; os perfis de óleo ficam em `OilChangeActivity`. Consulte [veículos](docs/veiculos-threejs.md).

**Máquina:** equipamentos com painel usam `equipment.json` e `activities.json`; `model` opcional substitui a aparência, mantendo a colisão configurada. Para comportamento próprio, implemente adaptador com `data.id`, `anchor` (Vector3), `outline`, `setHighlight` e `update`, use `registry.attach` e conecte a ação em Game. Mantenha o estado independente da interface, como LiftMotion. Cadastrar um nome não gera a máquina real.

**Atividade:** implemente regras testáveis em `education/`. Para serviço sequencial simples, acrescente uma definição em `ServiceActivity.jobs` e seus alvos/apresentação na sessão. Para prática diferente, crie uma sessão em `systems/` com `update` e `dispose`, coordenando regras, câmera e UI, e conecte-a em Game. As regras das outras atividades permanecem independentes. Consulte [montagem](docs/pratica-montagem.md) e [óleo](docs/troca-de-oleo.md).

## Verificação e restauração

Veja [relatório completo](docs/refatoracao.md) e [arquitetura](docs/arquitetura.md). Testes CPU e navegador headless não substituem conferência visual e medição no laboratório.

O smoke opcional `npm run test:browser` requer Vite na porta 5175 e Chromium com depuração na porta 9225, em perfil de teste separado. Ajuste URLs com `SMOKE_BASE_URL` e `SMOKE_DEBUG_URL`. Relatório e captura ficam em `.browser-refactor/`; a fixture não integra o build de produção.

O backup anterior à refatoração, incluindo alterações locais, está registrado no relatório. Não use reset destrutivo para restaurar: já havia trabalho não commitado. Documentos históricos de reconstrução permanecem em docs como registros da época.
