import { Engine } from './Engine.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { ProgressSystem } from '../systems/ProgressSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { AppUI } from '../ui/AppUI.js';
import { EquipmentPanel } from '../ui/EquipmentPanel.js';
import { bindTouchControls } from '../ui/TouchControls.js';
import { loadJSON } from '../systems/DataLoader.js';
import { VehicleStation } from '../objects/VehicleStation.js';
import { AssemblySession } from '../systems/AssemblySession.js';
import { OilChangeSession } from '../systems/OilChangeSession.js';
import { MaintenanceStation } from '../objects/MaintenanceStation.js';
import { collectInspectableVehicles } from '../vehicles/InspectableVehicles.js';
import { VehicleSelection } from '../systems/VehicleSelection.js';
import { InspectionSession } from '../systems/InspectionSession.js';
import { InspectionPanel } from '../ui/InspectionPanel.js';
import { BenchEngine } from '../objects/BenchEngine.js';
import { BenchEngineSession } from '../systems/BenchEngineSession.js';
import '../ui/oil-change.css';
import '../ui/inspection.css';

export function createGame(root) {
  const abort = new AbortController();
  let disposed = false,
    started = false,
    resourcesDisposed = false;
  let config, equipment, activities, assemblyDefinition;

  const ui = new AppUI(root);
  const progress = new ProgressSystem();
  const audio = new AudioSystem();
  let engine,
    interaction,
    panel,
    assembly,
    oilChange,
    inspection,
    benchEngine,
    vehicleSelection,
    state = 'loading',
    mode = 'free',
    returnState = 'home',
    guideStep = 0;
  let resetTouch = () => {};
  const modeNames = {
    free: 'EXPLORAÇÃO LIVRE',
    guided: 'VISITA GUIADA',
    mission: 'MISSÃO · CONHECER A BANCADA',
  };
  window.addEventListener('pagehide', dispose, { signal: abort.signal });

  function refreshProgress() {
    ui.updateProgress(progress);
    if (!progress.available)
      ui.toast('Armazenamento local indisponível. O progresso será mantido apenas nesta sessão.');
    updateObjective();
  }
  function updateObjective() {
    const objective = ui.$('objective');
    ui.$('mode-label').textContent = modeNames[mode];
    objective.classList.toggle('hidden', mode === 'free');
    const visited = progress.data.visited.includes('bancada-demo');
    const done = Boolean(progress.data.completed['preparar-bancada']);
    if (mode === 'guided')
      objective.textContent =
        guideStep === 0
          ? '01 / 03 · Caminhe até a bancada com morsa no setor de motores, à frente e à direita.'
          : guideStep === 1
            ? '02 / 03 · Conheça os componentes e os cuidados. Abra a aba Atividade.'
            : '03 / 03 · Visita concluída. Continue explorando ou repita a atividade.';
    if (mode === 'mission')
      objective.textContent = `Conhecer o posto · ${Number(visited) + Number(done)}/2\n${!visited ? 'Encontre e abra o painel da bancada didática.' : !done ? 'Conclua as duas perguntas da aba Atividade.' : 'Missão concluída. Consulte seu resultado no painel.'}`;
  }
  function setState(next) {
    state = next;
    ui.show('home', next === 'home');
    ui.show('hud', next === 'playing');
    document.body.classList.toggle('at-home', next === 'home');
    if (next !== 'playing') {
      engine?.controls.stop();
      resetTouch();
      ui.show('interact', false);
    }
  }
  function home() {
    engine?.outdoor?.exitCar();
    panel?.close();
    ui.closeModal();
    setState('home');
    const view = config.reconstruction.comparisonViews[0];
    engine.camera.position.fromArray(view.position);
    engine.camera.lookAt(...view.target);
    refreshProgress();
    ui.$('enter').focus();
  }
  function enter(selectedMode = mode) {
    engine.outdoor.exitCar();
    mode = selectedMode;
    guideStep = 0;
    panel.close();
    ui.closeModal();
    engine.controls.reset();
    ui.$('objective').textContent = '';
    updateObjective();
    setState('playing');
    engine.controls.start();
  }
  function resume() {
    ui.closeModal();
    panel.close();
    setState('playing');
    engine.controls.start();
  }
  function pause(message) {
    if (!engine || state !== 'playing') return;
    setState('paused');
    showPause(message);
  }
  function showPause(message) {
    ui.modal(
      'Uma pausa na oficina',
      `<p>${message || 'Seu ponto no ambiente foi mantido.'}</p><div class="button-stack"><button id="resume" class="primary">Retomar exploração →</button><button id="pause-settings">Configurações</button><button id="reset-position">Voltar ao ponto inicial</button><button id="back-home">Tela inicial</button></div>`,
    );
    ui.bind('resume', resume);
    ui.bind('pause-settings', () => showSettings('paused'));
    ui.bind('reset-position', () => {
      engine.outdoor.exitCar();
      engine.controls.reset();
      resume();
    });
    ui.bind('back-home', home);
  }
  function showHelp(origin = state) {
    if (origin === 'playing') setState('paused');
    returnState = origin === 'home' ? 'home' : 'paused';
    state = 'help';
    ui.modal(
      'Como explorar',
      `<p>Conheça o espaço e aproxime-se da bancada didática à esquerda da entrada. Olhe para ela até aparecer a indicação de interação.</p><dl class="controls-list"><div><dt>W A S D / setas</dt><dd>Caminhar</dd></div><div><dt>Mouse</dt><dd>Olhar ao redor</dd></div><div><dt>E</dt><dd>Conhecer o equipamento em foco</dd></div><div><dt>Shift</dt><dd>Caminhar um pouco mais rápido</dd></div><div><dt>ESC</dt><dd>Pausar e liberar o cursor</dd></div></dl><p class="note">No celular: joystick à esquerda, arraste à direita para olhar e toque na indicação do equipamento para interagir. Use o botão Ⅱ para pausar.</p><button id="help-close" class="primary">Entendi</button>`,
    );
    ui.bind('help-close', () => {
      state = returnState;
      if (state === 'home') home();
      else showPause();
    });
  }
  function showSettings(origin = state) {
    returnState = origin === 'home' ? 'home' : 'paused';
    state = 'settings';
    const s = progress.data.settings;
    ui.modal(
      'Sua experiência',
      `<div class="setting-row"><label for="quality">Qualidade gráfica<small>Resolução de renderização e reflexos</small></label><select id="quality"><option value="low">Baixa · desempenho</option><option value="medium">Média · equilibrada</option><option value="high">Alta · mais detalhes</option></select></div><div class="setting-row"><label for="sensitivity">Sensibilidade do olhar</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${s.sensitivity}"></div><div class="setting-row"><label for="audio">Feedback sonoro<small>Discreto e opcional</small></label><input id="audio" type="checkbox" ${s.audio ? 'checked' : ''}></div><div class="button-stack"><button id="save-settings" class="primary">Aplicar configurações</button><button id="reset-progress">Reiniciar progresso educativo</button><button id="settings-close">Voltar</button></div><p class="muted">O progresso é local a este navegador. Nenhum dado de aluno é solicitado.</p>`,
    );
    ui.$('quality').value = s.quality;
    ui.bind('save-settings', () => {
      progress.settings({
        quality: ui.$('quality').value,
        sensitivity: Number(ui.$('sensitivity').value),
        audio: ui.$('audio').checked,
      });
      engine.applySettings(progress.data.settings);
      audio.enabled = progress.data.settings.audio;
      audio.play();
      ui.toast('Configurações aplicadas.');
      refreshProgress();
    });
    ui.bind('reset-progress', () => {
      ui.modal(
        'Reiniciar progresso?',
        '<p>As visitas e os resultados salvos neste navegador serão apagados. As configurações gráficas serão mantidas.</p><div class="button-stack"><button id="confirm-reset" class="primary">Reiniciar progresso</button><button id="cancel-reset">Cancelar</button></div>',
      );
      ui.bind('confirm-reset', () => {
        progress.reset();
        guideStep = 0;
        refreshProgress();
        showSettings(returnState);
      });
      ui.bind('cancel-reset', () => showSettings(returnState));
    });
    ui.bind('settings-close', () => {
      state = returnState;
      if (state === 'home') home();
      else showPause();
    });
  }
  function showActivities() {
    state = 'activities';
    ui.modal(
      'Escolha seu percurso',
      `<p>Escolha uma prática para começar.</p><div class="mode-cards"><button id="start-oil-tour"><span>MANUTEN??O NO ELEVADOR</span><strong>Troca de ?leo</strong><small>Eleve o carro no posto azul, aproxime-se do c?rter e inicie a manuten??o.</small></button><button id="start-practice"><span>OFICINA PRÁTICA · 4 SERVIÇOS</span><strong>Mexer no carro</strong><small>Monte a roda, troque o filtro, teste a bateria e acenda as luzes.</small></button><button data-mode="free"><span>EXPLORAÇÃO LIVRE</span><strong>Conheça no seu ritmo</strong><small>Caminhe até o veículo à direita ou conheça a bancada à esquerda.</small></button><button data-mode="guided"><span>VISITA GUIADA</span><strong>Fundamentos da bancada</strong><small>Siga três etapas: encontre, conheça e responda.</small></button><button data-mode="mission"><span>MISSÃO EDUCATIVA</span><strong>Conhecer o posto</strong><small>Encontre a bancada e conclua uma atividade de duas questões.</small></button></div><button id="activities-close">Voltar</button>`,
    );
    ui.$('modal')
      .querySelectorAll('[data-mode]')
      .forEach(b => (b.onclick = () => enter(b.dataset.mode)));
    ui.bind('activities-close', home);
    ui.bind('start-practice', startAssembly);
    ui.bind('start-oil-tour', () => {
      enter('free');
      ui.toast(
        'V? aos elevadores azuis no fundo da oficina. Acione E para subir; depois olhe para o c?rter sob o motor.',
      );
    });
  }
  function startAssembly() {
    if (state === 'assembly') return;
    if (state === 'home' || state === 'activities') engine.controls.reset();
    panel.close();
    ui.closeModal();
    setState('assembly');
    assembly.open();
  }
  async function chooseVehicle(vehicle) {
    if (state !== 'playing') return;
    setState('inspection');
    interaction.update(false);
    ui.closeModal();
    try {
      await inspection.open(vehicle);
    } catch (error) {
      console.error('Falha ao abrir inspeção:', error);
      ui.toast('Não foi possível inspecionar este veículo.');
      setState('paused');
      showPause();
    }
  }
  function openEquipment() {
    if (state === 'playing' && engine.outdoor.driving) {
      if (!engine.outdoor.exitCar()) ui.toast('Mova o carro para um local com espaço para sair.');
      return;
    }
    if (state !== 'playing' || !interaction.current) return;
    const item = interaction.current;
    if (item.data.type === 'gate') {
      interaction.update(false);
      if (!engine.gate.cross()) ui.toast('Aproxime-se do portão e deixe a passagem livre.');
      return;
    }
    if (item.data.type === 'driving') {
      engine.outdoor.enterCar();
      interaction.update(false);
      ui.toast('W/S: acelerar e ré · A/D: virar · Espaço: frear · E: sair. No celular, use o joystick.');
      return;
    }
    if (item.data.type === 'bench-engine') {
      setState('engine-inspection');
      interaction.update(false);
      benchEngine.open(item);
      return;
    }
    if (item.data.type === 'oil-change') {
      if (oilChange.open(item)) {
        panel.close();
        ui.closeModal();
        setState('oil-change');
      }
      return;
    }
    if (item.data.type === 'lift') {
      if (item.activate()) audio.play();
      return;
    }
    if (item.data.type === 'assembly') {
      startAssembly();
      return;
    }
    setState('panel');
    engine.focus(item);
    item.setHighlight(true);
    panel.open(
      item,
      activities.find(a => a.id === item.data.activityId),
    );
    guideStep = Math.max(guideStep, 1);
    refreshProgress();
    audio.play();
  }

  async function boot() {
    if (disposed || started) throw new Error('Esta aplicação já foi iniciada ou encerrada.');
    started = true;
    try {
      [config, equipment, activities, assemblyDefinition] = await Promise.all([
        loadJSON(`${import.meta.env.BASE_URL}data/workshop.json`),
        loadJSON(`${import.meta.env.BASE_URL}data/equipment.json`),
        loadJSON(`${import.meta.env.BASE_URL}data/activities.json`),
        loadJSON(`${import.meta.env.BASE_URL}data/assembly.json`),
      ]);
      if (disposed) return;
      engine = new Engine(ui.$('viewport'), config, progress.data.settings, pause);
      if (config.vehicles?.length) await engine.loadVehicles(config.vehicles);
      if (disposed) return;
      audio.enabled = progress.data.settings.audio;
      resetTouch = bindTouchControls(ui, engine.controls);
      interaction = new InteractionSystem(engine);
      panel = new EquipmentPanel(
        ui,
        progress,
        audio,
        () => {
          panel.close();
          setState('paused');
          showPause();
        },
        () => {
          guideStep = 2;
          refreshProgress();
        },
      );
      for (const data of equipment) {
        await engine.registry.register(data, message => ui.toast(message));
        if (disposed) return;
      }
      const bench = engine.registry.items.get('bancada-demo');
      if (bench) {
        const top = bench.parts.get('tampo');
        const motor = new BenchEngine({
          position: [bench.data.position[0] - 0.35, 0, bench.data.position[2]],
          size: [2.8, top.position.y + top.scale.y / 2 - 0.055, 1.1],
        });
        engine.world.root.add(motor.group);
        engine.world.benchEngine = motor;
        engine.registry.attach(motor);
      }
      for (const item of engine.world.root.userData.rearDisplays) engine.registry.attach(item);
      benchEngine = new BenchEngineSession(
        engine,
        new InspectionPanel(root, () => benchEngine.close()),
        resume,
      );
      engine.registry.attach(new VehicleStation(engine.world.vehicle));
      for (const lift of engine.world.lifts) engine.registry.attach(lift);
      for (const lift of engine.world.lifts) engine.registry.attach(new MaintenanceStation(lift));
      oilChange = new OilChangeSession(engine, ui, progress, audio, () => {
        setState('paused');
        refreshProgress();
        showPause(
          'Atividade de óleo encerrada. O exercício foi restaurado; resultados completos ficam salvos.',
        );
      });
      assembly = new AssemblySession(engine, ui, assemblyDefinition, progress, audio, () => {
        setState('paused');
        refreshProgress();
        showPause('Prática encerrada. Você pode retomar a exploração ou voltar ao menu.');
      });
      inspection = new InspectionSession(
        engine,
        new InspectionPanel(root, () => inspection.close()),
        () => {
          refreshProgress();
          resume();
        },
        { progress, assemblyDefinition },
      );
      vehicleSelection = new VehicleSelection(
        engine,
        [
          ...collectInspectableVehicles(engine),
          ...engine.world.root.userData.rearDisplays.map(item => ({
            id: item.data.id,
            root: item.group,
            display: item,
          })),
          ...(engine.world.benchEngine
            ? [{ id: 'motor-bancada', root: engine.world.benchEngine.group }]
            : []),
        ],
        vehicle => {
          if (vehicle.display || vehicle.id === 'motor-bancada') {
            setState('engine-inspection');
            interaction.update(false);
            benchEngine.open(vehicle.display || engine.world.benchEngine);
          } else chooseVehicle(vehicle);
        },
        () => state === 'playing' && !engine.outdoor.outside,
        [engine.renderer.domElement, ui.$('look-zone')],
      );
      root.querySelector('.desktop-hint').textContent =
        'W A S D · mover   E · interagir   Portão · E para atravessar';
      ui.bind('enter', () => enter('free'));
      ui.bind('how', () => showHelp('home'));
      ui.bind('activities', showActivities);
      ui.bind('settings', () => showSettings('home'));
      ui.bind('practice', startAssembly);
      ui.bind('pause', () => pause());
      ui.bind('help', () => showHelp('playing'));
      ui.bind('interact', openEquipment);
      ui.bind('fullscreen', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (document.documentElement.requestFullscreen)
            await document.documentElement.requestFullscreen();
          else ui.toast('Tela cheia não está disponível neste navegador.');
        } catch {
          ui.toast('O navegador não permitiu ativar tela cheia.');
        }
      });
      document.addEventListener(
        'keydown',
        e => {
          if (e.code === 'KeyE' && !e.repeat && state === 'playing') openEquipment();
          if (e.code === 'Escape') {
            if (state === 'engine-inspection') benchEngine.close();
            else if (state === 'inspection') inspection.close();
            else if (state === 'vehicle-choice') resume();
            else if (state === 'playing') pause();
            else if (state === 'panel') {
              panel.close();
              setState('paused');
              showPause();
            } else if (['settings', 'help'].includes(state)) {
              state = returnState;
              state === 'home' ? home() : showPause();
            } else if (state === 'activities') home();
          }
        },
        { signal: abort.signal },
      );
      engine.start(dt => {
        assembly.update(dt);
        oilChange.update(dt);
        const driving = engine.outdoor.driving;
        const target = driving ? engine.outdoor.item : interaction.update(state === 'playing');
        if (driving)
          engine.outdoor.item.data.name = `E · Sair do carro · ${Math.round(Math.abs(engine.outdoor.speed) * 3.6)} km/h`;
        else engine.outdoor.item.data.name = 'Carro da pista · E para dirigir';
        ui.updateInteraction(target, state === 'playing');
      });
      ui.show('loading', false);
      home();
    } catch (error) {
      console.error('Falha ao iniciar a oficina:', error);
      disposeResources();
      if (disposed) return;
      ui.error(
        'Verifique se o navegador oferece WebGL 2 e aceleração gráfica. Se já estiverem ativos, recarregue a página. Detalhes técnicos no console.',
      );
    }
  }
  function disposeResources() {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    abort.abort();
    resetTouch.dispose?.();
    vehicleSelection?.dispose();
    benchEngine?.dispose();
    inspection?.dispose();
    interaction?.update(false);
    oilChange?.dispose();
    assembly?.dispose();
    engine?.dispose();
    audio.dispose();
    ui.dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeResources();
  }
  return { start: boot, dispose };
}
