export class AppUI {
  constructor(root) {
    root.innerHTML = `
      <div id="viewport"></div>
      <div id="loading" class="loading"><span class="spinner"></span><strong>Preparando a oficina</strong><p>Geometria, iluminação e materiais locais.</p></div>
      <section id="home" class="home hidden" aria-labelledby="title">
        <header class="brand"><span class="brand-mark">A<span>3D</span></span><div>EDUCAÇÃO PROFISSIONAL<small>Caxias do Sul · RS</small></div><span class="version">RECONSTRUÇÃO 03</span></header>
        <div class="home-content"><div class="eyebrow"><i></i> EXPLORE. IDENTIFIQUE. APRENDA.</div><h1 id="title">SENAI<br>Automotivo <em>3D</em></h1><p class="subtitle">Ambiente Virtual de Aprendizagem</p><p class="intro">O primeiro contato com a oficina<br>começa antes da prática.</p>
        <button id="enter" class="primary big">Entrar na Oficina <span>↗</span></button>
        <button id="practice" class="practice-entry">Mexer no carro <span>PRÁTICA 3D →</span></button>
        <nav class="home-nav" aria-label="Menu principal"><button id="how">Como jogar</button><button id="activities">Atividades <span class="count">02</span></button><button id="settings">Configurações</button></nav>
        <div class="progress-home" id="home-progress"></div></div>
        <div class="scene-caption"><span class="caption-line"></span><small>01 / OFICINA AUTOMOTIVA</small><p>Um espaço para conhecer.<br>Um caminho para aprender.</p><span class="badge">AMBIENTE PROVISÓRIO</span></div>
        <footer><span>Base experimental · geometria e medidas estimadas</span><span>Identidade institucional reservada · sem logotipo oficial</span></footer>
      </section>
      <div id="hud" class="hidden">
        <header class="hud-top"><div class="area-tag"><span class="red-dot"></span><div>OFICINA AUTOMOTIVA<small>Referências reais · medidas estimadas</small></div></div><div class="hud-actions"><button id="help" aria-label="Ajuda">?</button><button id="fullscreen" aria-label="Alternar tela cheia">⛶</button><button id="pause" aria-label="Pausar">Ⅱ</button></div></header>
        <div id="objective" class="objective"></div><div class="crosshair" aria-hidden="true"></div>
        <button id="interact" class="interact hidden"><span class="key">E</span><span><strong id="target-name"></strong><small id="target-action">Conhecer equipamento · demonstração</small></span></button>
        <div class="hud-bottom"><span id="mode-label">EXPLORAÇÃO LIVRE</span><span class="desktop-hint">W A S D · mover &nbsp; Mouse · olhar &nbsp; ESC · pausar</span><span id="progress-label"></span></div>
        <div id="mobile-controls"><div id="look-zone" aria-label="Arraste para olhar"></div><div id="joystick" aria-label="Joystick de movimento"><div id="stick"></div></div><span class="touch-tip">Arraste à direita para olhar</span></div>
      </div>
      <section id="panel" class="equipment-panel hidden" role="dialog" aria-modal="true" aria-labelledby="equipment-name"><div class="panel-header"><span class="eyebrow">ESTAÇÃO DE APRENDIZAGEM</span><button id="close-panel" class="icon-button" aria-label="Fechar painel">×</button></div><span class="badge">MODELO GENÉRICO · PROVISÓRIO</span><h2 id="equipment-name"></h2><p id="equipment-category" class="muted"></p><div id="tabs" class="tabs" role="tablist" aria-label="Informações do equipamento"></div><div id="panel-body" class="panel-body" role="tabpanel" tabindex="0"></div></section>
      <div id="modal-backdrop" class="modal-backdrop hidden"><section id="modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"></section></div>
      <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
      <div id="error" class="error-screen hidden" role="alert"></div>`;
    this.$ = id => document.getElementById(id);
    this.toastTimer = null;
    this.abort = new AbortController();
    document.addEventListener('keydown', e => {
      const dialog = !this.$('modal-backdrop').classList.contains('hidden') ? this.$('modal') : !this.$('panel').classList.contains('hidden') ? this.$('panel') : null;
      if (!dialog || e.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    }, { signal: this.abort.signal });
  }
  show(id, value = true) { this.$(id).classList.toggle('hidden', !value); }
  updateInteraction(target, active) {
    this.show('interact', Boolean(target) && active);
    if (!target || !active) return;
    const name = this.$('target-name');
    const action = this.$('target-action');
    const label = target.actionLabel || 'Conhecer equipamento · demonstração';
    if (name.textContent !== target.data.name) name.textContent = target.data.name;
    if (action.textContent !== label) action.textContent = label;
  }
  bind(id, fn) { this.$(id).addEventListener('click', fn, { signal: this.abort.signal }); }
  dispose() { clearTimeout(this.toastTimer); this.abort.abort(); }
  toast(message) { clearTimeout(this.toastTimer); this.$('toast').textContent = message; this.show('toast'); this.toastTimer = setTimeout(() => this.show('toast', false), 6000); }
  modal(title, body) {
    this.$('modal').innerHTML = `<div class="modal-heading"><h2 id="modal-title">${title}</h2></div>${body}`;
    this.show('modal-backdrop'); this.$('modal').focus();
  }
  closeModal() { this.show('modal-backdrop', false); }
  error(message) {
    this.show('loading', false); this.show('error');
    this.$('error').innerHTML = '<h1>Não foi possível abrir a oficina</h1><p></p><button class="primary">Tentar novamente</button>';
    this.$('error').querySelector('p').textContent = message;
    this.$('error').querySelector('button').onclick = () => location.reload();
  }
  updateProgress(progress) {
    const result = progress.data.completed['preparar-bancada'];
    const practice = progress.data.completed['montagem-roda'] || Object.entries(progress.data.completed).find(([id]) => id.startsWith('montagem-roda:'))?.[1];
    const services = Number(Boolean(practice)) + ['filter', 'battery', 'lights'].filter(id => progress.data.completed[`servico-${id}`]).length
      + ['corolla', 'hb20', 'gol'].filter(id => progress.data.completed[`troca-oleo-${id}`]).length;
    if (services) {
      this.$('home-progress').textContent = `✓ ${services}/7 práticas concluídas no carro`;
      this.$('progress-label').textContent = `OFICINA ${services}/7`;
      return;
    }
    this.$('home-progress').textContent = practice ? `✓ Montagem de roda concluída · aproveitamento ${practice.score}%` : result ? `✓ Fundamentos da bancada · ${result.score}/${result.total} respostas corretas` : 'Roda, filtro, bateria e luzes: escolha o que fazer no carro.';
    this.$('progress-label').textContent = practice ? `MONTAGEM ${practice.score}%` : 'PRÁTICA 3D + BANCADA';
  }
}
