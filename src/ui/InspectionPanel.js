export class InspectionPanel {
  constructor(root, onBack) {
    this.element = document.createElement('section');
    this.element.className = 'vehicle-inspection hidden';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'inspection-title');
    this.element.innerHTML = `<img class="inspection-background" alt="" aria-hidden="true"><div class="inspection-window"><header class="inspection-header"><div><small>INSPEÇÃO E MANUTENÇÃO</small><h1 id="inspection-title"></h1></div><div class="inspection-header-actions"><button type="button" data-overview>Ver carro inteiro</button><button class="primary" type="button" data-back>Voltar à oficina</button></div></header><div class="inspection-content"><div class="inspection-stage"><div class="inspection-canvas"></div><div class="inspection-tooltip hidden" role="tooltip"><strong></strong><span></span><small>Clique para mexer ou examinar</small></div><p class="inspection-stage-hint">Arraste para girar · Role para aproximar</p></div><aside class="inspection-part"><small>COMPONENTE SELECIONADO</small><h2></h2><p data-description></p><div class="inspection-part-actions"></div><p data-feedback role="status" aria-live="polite"></p></aside></div><footer class="inspection-footer"><p role="status" aria-live="polite"></p></footer></div>`;
    this.button = this.element.querySelector('[data-back]');
    this.interiorButton = document.createElement('button');
    this.interiorButton.type = 'button';
    this.interiorButton.textContent = 'Ver interior';
    this.interiorButton.hidden = true;
    this.interiorButton.dataset.interior = '';
    this.interiorButton.onclick = () => this.onInterior?.();
    this.element.querySelector('.inspection-header-actions').prepend(this.interiorButton);
    this.button.onclick = onBack;
    this.element.querySelector('[data-overview]').onclick = () => this.onOverview?.();
    this.viewport = this.element.querySelector('.inspection-canvas');
    this.tooltip = this.element.querySelector('.inspection-tooltip');
    this.abort = new AbortController();
    this.element.addEventListener(
      'keydown',
      event => {
        if (event.key !== 'Tab') return;
        const buttons = [...this.element.querySelectorAll('button:not([disabled])')];
        if (!buttons.length) return;
        const first = buttons[0],
          last = buttons.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || !this.element.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !this.element.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      },
      { signal: this.abort.signal },
    );
    root.append(this.element);
    this.part(null, []);
  }

  captureBackground(engine) {
    try {
      engine.renderer.render(engine.scene, engine.camera);
      this.element.querySelector('.inspection-background').src = engine.renderer.domElement.toDataURL(
        'image/webp',
        0.7,
      );
    } catch (error) {
      // A dark backdrop remains usable if a model texture prevents canvas export.
      console.warn('Não foi possível capturar o fundo da oficina.', error);
    }
  }

  mountCanvas(canvas) {
    this.canvas = canvas;
    this.originalParent = canvas.parentNode;
    this.originalNext = canvas.nextSibling;
    this.viewport.append(canvas);
    return this.viewport;
  }

  restoreCanvas() {
    this.resizeObserver?.disconnect();
    if (this.canvas && this.originalParent) {
      const next = this.originalNext?.parentNode === this.originalParent ? this.originalNext : null;
      this.originalParent.insertBefore(this.canvas, next);
    }
    this.canvas = this.originalParent = this.originalNext = null;
  }

  observeResize(callback) {
    if (!globalThis.ResizeObserver) return;
    this.resizeObserver = new globalThis.ResizeObserver(callback);
    this.resizeObserver.observe(this.viewport);
  }

  show(name) {
    this.element.querySelector('h1').textContent = name;
    this.element.classList.remove('hidden');
    this.part(null, []);
    this.button.focus();
  }

  hover(part, x, y) {
    this.tooltip.classList.toggle('hidden', !part);
    if (!part) return;
    this.tooltip.querySelector('strong').textContent = part.name;
    this.tooltip.querySelector('span').textContent = part.description;
    const rect = this.viewport.getBoundingClientRect();
    this.tooltip.style.left = `${Math.max(8, Math.min(x - rect.left + 16, rect.width - 268))}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(y - rect.top + 18, rect.height - 150))}px`;
  }

  part(part, actions, message = '') {
    this.element.querySelector('.manual-wheel-tools')?.remove();
    this.element.querySelector('.inspection-part h2').textContent = part?.name || 'Escolha uma peça';
    this.element.querySelector('[data-description]').textContent =
      part?.description ||
      'Passe o mouse sobre o carro para identificar cada componente. Clique na peça para abrir suas opções.';
    const list = this.element.querySelector('.inspection-part-actions');
    list.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.partAction = action.id;
      button.textContent = action.label;
      button.onclick = () => this.onAction?.(action.id);
      list.append(button);
    }
    this.element.querySelector('[data-feedback]').textContent = message;
  }

  status(message) {
    this.element.querySelector('.inspection-footer [role="status"]').textContent = message;
  }
  interiorView(available, active = false) {
    this.interiorButton.hidden = !available;
    this.interiorButton.textContent = active ? 'Ver exterior' : 'Ver interior';
    this.interiorButton.setAttribute('aria-pressed', String(active));
  }
  manualWheel(view) {
    const section = document.createElement('section');
    section.className = 'manual-wheel-tools';
    section.dataset.completed = String(view.completed);
    section.setAttribute('aria-label', 'Ferramentas da roda');
    const instruction = document.createElement('p');
    instruction.className = 'manual-wheel-instruction';
    instruction.textContent = view.instruction;
    section.append(instruction);
    this.element.querySelector('[data-feedback]').textContent = '';
    const label = document.createElement('strong');
    label.textContent = 'Ferramenta na mão';
    section.append(label);
    for (const tool of view.tools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.manualTool = tool.id;
      button.textContent = tool.label;
      button.setAttribute('aria-pressed', String(view.tool === tool.id));
      button.disabled = view.busy || view.completed;
      button.onclick = () => this.onManualTool?.(tool.id);
      section.append(button);
    }
    const progress = document.createElement('p');
    progress.dataset.manualProgress = '';
    progress.setAttribute('aria-live', 'polite');
    section.append(progress);
    const feedback = document.createElement('p');
    feedback.textContent = view.feedback;
    feedback.className = 'manual-wheel-feedback';
    section.append(feedback);
    const warning = document.createElement('small');
    warning.textContent =
      'Distâncias e giros são didáticos. Não há torque real cadastrado. Use treinamento supervisionado.';
    section.append(warning);
    this.element.querySelector('.inspection-part-actions').before(section);
    this.element.querySelector('[data-overview]').textContent = 'Focar roda';
    this.element.querySelector('.inspection-stage-hint').textContent =
      'Fixadores: arraste para girar · Roda: Mãos + arrastar · Shift + arrastar: alinhar';
    this.status(
      view.completed
        ? 'Troca de roda simulada concluída.'
        : 'As etapas são realizadas nas peças 3D. Os botões selecionam somente ferramentas.',
    );
  }
  manualProgress(index, progress) {
    const node = this.element.querySelector('[data-manual-progress]');
    if (node) node.textContent = `Fixador ${index + 1} · giro virtual ${Math.round(progress * 100)}%`;
  }
  clearManualWheel() {
    this.element.querySelector('.manual-wheel-tools')?.remove();
    this.onManualTool = null;
    this.element.querySelector('[data-overview]').textContent = 'Ver carro inteiro';
    this.element.querySelector('.inspection-stage-hint').textContent =
      'Arraste para girar · Role para aproximar';
    this.status('Passe o mouse nas peças e clique para ver as ações.');
  }
  hide() {
    this.hover(null);
    this.element.classList.add('hidden');
    this.element.querySelector('.inspection-background').removeAttribute('src');
  }
  dispose() {
    this.restoreCanvas();
    this.abort.abort();
    this.button.onclick = null;
    this.element.remove();
  }
}
