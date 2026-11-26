# Inspeção 3D de veículos

## Uso

A janela reúne todas as práticas do carro didático numa lista lateral: troca manual de roda, filtro de ar, bateria, luzes, palheta do limpador, lavador de para-brisa, vela de ignição e pressão dos pneus. A antiga estação do carro por proximidade e a tecla E foram removidas; clicar (ou tocar) no veículo é o caminho único para as práticas. A montagem guiada em tela cheia também foi substituída pela troca manual dentro da janela, que mantém a sequência didática e os resultados salvos. Consulte [roda-manual.md](roda-manual.md) para o fluxo atualizado, limites e testes.

Identificação refinada das rodas: pneu, banda de rodagem, aro, raios, calota central, aberturas, cubo e fixadores têm descrições próprias nas superfícies representadas. A pequena tampa central não é descrita como uma calota integral. As peças mantêm a ação da roda correspondente, inclusive após batching; mudar entre componentes da mesma roda não reinicia a prática. Atualização validada por 72/72 testes Node, com raycasts nas superfícies reais e nos lotes dos carros de elevador.

Entre na oficina, olhe para um carro e clique nele (a mira indica o ponto selecionado). No toque, toque diretamente no carro; arrastar serve para olhar. O clique abre diretamente uma janela central sobre a oficina escurecida/desfocada, sem confirmação intermediária. A janela usa o mesmo canvas e renderizador. Arraste para girar, use roda do mouse/pinça para aproximar e botão direito/arraste com dois dedos para mover. **Voltar à oficina** restaura a navegação; ESC também encerra a inspeção.

Os seis veículos atuais estão incluídos: carro didático, dois carros dos elevadores e três veículos cobertos. Os cobertos permanecem cobertos sem um modelo específico configurado; nenhuma carroceria fictícia foi adicionada. A frota GLB opcional também registra seus veículos, usando o LOD0 disponível na inspeção.

Passe o mouse sobre uma peça para ver nome, descrição e destaque quando sua malha é independente. Clique para abrir o painel específico. No carro didático, a lista **Práticas** inicia diretamente qualquer uma das oito atividades e o painel da peça oferece o mesmo acesso; também há abertura/fechamento do capô, faróis e exames em detalhe. As práticas são executadas dentro da janela com as regras educativas existentes. As mesmas oito práticas constam do resumo de **Oficina prática**. Cada peça também permite exame em detalhe; o botão **Ver carro inteiro** restaura o enquadramento.

Nos carros de elevador, capô e faróis têm ações quando os componentes existem. Portas, porta-malas e outras peças fixas possuem identificação e exame, mas não uma abertura fictícia. Carros cobertos identificam a capa; não se inventa o que está sob ela. GLBs detalhados podem identificar peças por `extras.inspectionPart` nos nós (IDs em VehicleParts); manipulação de um modelo diferente exige mapeamento próprio.

As atividades anteriores continuam pelos caminhos existentes: E nas estações, elevadores e carro de testes. Práticas na janela salvam progresso somente ao concluir; trocar de peça, encerrar uma prática ou fechar a janela restaura as alterações transitórias do exercício. Comandos diretos de capô e luzes permanecem no veículo, salvo se fizerem parte de um exercício restaurado.

## Renderização e estado

Engine mantém um único GameLoop e WebGLRenderer. `setActiveView` seleciona uma visualização exclusiva: o callback atualiza a câmera e os componentes do carro selecionado e renderiza somente sua cena. Controles, elevadores, registro e sessões da oficina não avançam. Uma captura do canvas é feita antes da transição e usada como imagem estática desfocada ao fundo; não há um segundo renderizador. O canvas é movido para o espaço da janela e retorna ao viewport original ao sair. ResizeObserver ajusta proporção e tamanho ao painel. Ao sair, o mesmo loop retoma a oficina sem acumular tempo de simulação.

Sem modelo detalhado, InspectionModel empresta o próprio grupo do veículo: não clona geometrias, materiais ou texturas. Guarda pai, ordem dos irmãos, posição, quaternion, escala e visibilidade; normaliza a posição/orientação na inspeção e restaura tudo no encerramento. Transformações e estado dos componentes filhos permanecem no mesmo objeto. A câmera principal não é usada pelo OrbitControls.

A cena contém somente o veículo, fundo neutro e três luzes, sem duplicar o ambiente ou gerar sombras dinâmicas. O clique na oficina respeita a primeira superfície visível. Na janela, o raycast é atualizado quando o ponteiro ou a câmera mudam; não é repetido em repouso. Nomes de peças são preservados por instância e por faixas de triângulos nos lotes combinados, sem separar malhas ou aumentar o orçamento de desenhos da oficina. Regiões externas do veículo procedural usam coordenadas locais para portas, vidros, teto e acabamentos.

## Modelos detalhados opcionais

Nenhum modelo detalhado novo acompanha esta etapa. Para usar um arquivo próprio, configure um caminho relativo à base da aplicação, como `models/vehicles/carro/inspection.glb`, nestes campos de `public/data/workshop.json`:

| Veículo | Campo |
| --- | --- |
| Didático | `inspection.practiceModel` |
| Carro de elevador | `reconstruction.lifts[i].inspectionModel` |
| Veículo coberto | `reconstruction.coveredCars[i].inspectionModel` |
| Frota GLB opcional | `vehicles[i].inspectionModel` |

Mantenha posição, cor e demais campos existentes. Arquivos servidos ficam em `public/models/...`. Exemplo do didático:

```json
"inspection": {
  "practiceModel": "models/vehicles/didatico/inspection.glb"
}
```

Prefira GLB autocontido, em metros, com geometria finita. O enquadramento usa suas dimensões e permite vista inferior. Draco/KTX2 usam decodificadores locais já copiados por predev/prebuild. Parsers e decodificadores só são importados quando solicitados. Havendo loader da frota, ele é reutilizado.

O veículo da oficina aparece imediatamente enquanto os detalhes carregam. Em falha HTTP, parsing ou dimensões inválidas, o modelo atual permanece disponível; o console identifica arquivo e causa. Ao carregar detalhes válidos, o grupo original retorna à oficina pausada e somente o novo modelo fica na inspeção.

O detalhe é uma representação visual nesta etapa: não há transferência automática de estado mecânico entre modelos diferentes. Futuras peças interativas precisarão de identificadores e mapeamento explícito; não se presume equivalência entre nós de GLBs distintos. O estado original da oficina permanece preservado.

## Recursos

Sair aborta o download principal quando possível, descarta o modelo detalhado, remove OrbitControls e libera workers próprios do loader. Loaders da frota não são descartados pela inspeção. Conclusões tardias são descartadas por geração sem substituir uma inspeção mais recente. Detalhes não ficam em cache após sair. A oficina permanece em memória para retomada, mas não renderiza em paralelo.

## Verificação em 29/10/2026

- Baseline anterior preservado: **70 testes Node**, incluindo sete novos testes de identificação, metadados dos lotes, regras das práticas, estado visual e restauração. Catálogo, oclusão, loop exclusivo, carregamento, aborto e conclusão tardia continuam cobertos.
- Edge headless/WebGL 2: toque abre diretamente a janela e permite voltar na aplicação real; fixture verifica seis veículos, câmera principal, restauração dos grupos e altura/tempo do elevador preservados. Ponteiro real verifica nome/descrição do capô, clique e abertura; a prática de filtro é concluída dentro da janela com mudanças visuais verificadas.
- Passos controlados do callback de produção produziram **12 renderizações da inspeção e zero da oficina**. Não é medição de FPS.
- Entradas reais de mouse no OrbitControls confirmaram rotação, zoom e pan. Um GLB mínimo gerado somente para teste foi carregado pelo parser real e sua geometria recebeu dispose ao sair; não é um modelo de produção.
- Smoke concluído sem exceções, console.error, warnings ou falhas de requisição. Cenário, montagem, óleo, elevadores e página de comparação também foram verificados.
- Evidências locais: `.browser-refactor/results.json`, `inspection.png`, `inspection-parts.png` e `workshop.png`. Lint, Prettier e build são checks separados. Geometria/transformações da oficina conservam hash idêntico ao baseline, com 274 malhas e 55 volumes de colisão.

Vite precisou executar fora do sandbox: o Windows bloqueava resolução dos decodificadores com spawn EPERM. Desktop headless não concedeu pointer lock; a entrada completa foi validada com emulação de toque, e seleção desktop tem teste de eventos/raycast. Pointer lock físico, hardware do laboratório, celulares reais e GLBs comprimidos de produção não foram medidos.

Backup anterior à etapa, incluindo alterações locais: `C:\Users\492137~1\AppData\Local\Temp\automotivo-inspection-20261029-100136`. Nenhum commit, reset ou stash foi realizado.

Backup anterior à atualização da janela e das peças: `C:\Users\492137~1\AppData\Local\Temp\automotivo-partes-20261029-102749`.

## Módulos

| Arquivo | Responsabilidade |
| --- | --- |
| `vehicles/InspectableVehicles.js` | Catálogo de referências dos veículos existentes. |
| `systems/VehicleSelection.js` | Clique/toque, oclusão e identificação do veículo. |
| `systems/InspectionSession.js` | Cena, câmera, ciclo de vida e troca opcional do modelo. |
| `vehicles/InspectionModel.js` | Empréstimo/restauração e enquadramento. |
| `vehicles/InspectionAssetLoader.js` | Importação tardia, download cancelável e parsing GLB. |
| `ui/InspectionPanel.js`, `ui/inspection.css` | Apresentação e retorno. |
| `vehicles/VehicleParts.js` | Nomes, informações e identificação de componentes por metadados/regiões. |
| `systems/InspectionPartSelection.js` | Hover, clique e destaque dentro da janela. |
| `systems/InspectionWorkbench.js` | Adapta AssemblyActivity e ServiceActivity às ações da peça, com restauração de estado. |

Game abre `inspection` diretamente ao selecionar o veículo. Engine mantém seu contrato anterior para as outras sessões e para a página de comparação.
