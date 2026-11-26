import { AssemblyActivity } from '../education/AssemblyActivity.js';
import { ServiceActivity } from '../education/ServiceActivity.js';

/** Adapts the existing educational rules to the selected car inside the inspection window. */
export class InspectionWorkbench {
  constructor(vehicle, definition, progress) {
    Object.assign(this, { vehicle, definition, progress });
  }

  start(job) {
    if (
      !['wheel', 'filter', 'battery', 'lights', 'wiper', 'washer', 'plugs', 'pressure'].includes(job) ||
      !this.vehicle?.filter ||
      (job === 'wheel' && !this.definition)
    )
      return false;
    this.restore();
    const v = this.vehicle;
    this.snapshot = {
      hoodOpen: v.hoodOpen,
      filterCoverLift: v.filterCoverLift,
      filterLift: v.filterLift,
      filterVisible: v.filter.visible,
      filterColor: v.filter.material.color.clone(),
      lightsOn: v.lightsOn,
      hazardsOn: v.hazardsOn,
      wheelVisible: v.activeWheel.visible,
      bolts: v.bolts.map(bolt => ({ visible: bolt.visible, color: bolt.material.color.clone() })),
      terminals: v.terminals.map(terminal => terminal.material.color.clone()),
      serviceParts: {
        wiperLift: v.wiperLift,
        wiperBladeVisible: v.wiperBladeVisible,
        wiperBladeNew: v.wiperBladeNew,
        washerCapLift: v.washerCapLift,
        washerLevel: v.washerLevel,
        coilLift: v.coilLift,
        plugVisible: v.plugVisible,
        plugNew: v.plugNew,
        valveCapVisible: v.valveCapVisible,
        gaugeVisible: v.gaugeVisible,
        pressureChecked: v.pressureChecked,
      },
    };
    this.job = job;
    this.activity = job === 'wheel' ? new AssemblyActivity(this.definition) : new ServiceActivity(job);
    if (['filter', 'battery', 'washer', 'plugs'].includes(job)) v.setHood(true);
    this.sync();
    return true;
  }

  get instruction() {
    if (!this.activity) return '';
    if (this.activity.completed) {
      if (this.job === 'battery') return 'Leitura simulada: 12,6 V. Teste concluído e resultado salvo.';
      if (this.job === 'pressure') return 'Leitura simulada: 32 psi. Calibragem concluída e resultado salvo.';
      return 'Prática concluída. O resultado foi salvo.';
    }
    return this.job === 'wheel'
      ? this.activity.current.instruction
      : this.activity.definition.steps[this.activity.step];
  }

  get actions() {
    const a = this.activity;
    if (!a || a.completed) return [];
    if (this.job !== 'wheel') return [{ id: a.target, label: a.definition.steps[a.step] }];
    if (a.step === 0) return [{ id: 'inspect', label: 'Conferir apoio e cubo' }];
    if (a.step === 1) return [{ id: 'mount', label: 'Encaixar roda' }];
    if (a.step === 2)
      return [0, 1, 2, 3]
        .filter(i => !a.fasteners.has(i))
        .map(i => ({ id: `fit-${i}`, label: `Encaixar fixador ${i + 1}` }));
    if (a.step === 3) return [{ id: 'configure', label: 'Preparar torquímetro didático' }];
    if (a.step === 4)
      return [0, 1, 2, 3]
        .filter(i => !a.tightened.includes(i))
        .map(i => ({ id: `tighten-${i}`, label: `Apertar fixador ${i + 1}` }));
    return [{ id: 'verify', label: 'Conferir montagem' }];
  }

  perform(id) {
    const a = this.activity;
    if (!a || !this.actions.some(action => action.id === id))
      return { ok: false, message: 'Ação indisponível nesta etapa.' };
    let result;
    if (this.job === 'wheel') {
      const [action, index] = id.split('-');
      if (action === 'mount') a.select('wheel');
      if (action === 'fit') a.select('fastener');
      if (action === 'configure' || action === 'tighten') a.select('torque');
      result = a.perform(action, index === undefined ? undefined : Number(index));
    } else result = { ok: a.perform(id), message: '' };
    if (!result.ok) return result;
    this.sync();
    if (a.completed) {
      const score = this.job === 'wheel' ? Math.max(0, 100 - a.mistakes * 5) : 100;
      this.progress?.complete(this.job === 'wheel' ? this.definition.id : `servico-${this.job}`, score, 100);
    }
    return { ok: true, message: this.instruction };
  }

  sync() {
    const v = this.vehicle,
      a = this.activity;
    if (this.job === 'wheel') {
      v.activeWheel.visible = a.mounted;
      v.bolts.forEach((bolt, i) => {
        bolt.visible = a.fasteners.has(i);
        bolt.material.color.set(a.tightened.includes(i) ? '#67a989' : '#b8bcb9');
      });
    }
    if (this.job === 'filter') {
      v.filterCoverLift = a.step > 0 && a.step < 4 ? 0.45 : 0;
      v.filter.visible = a.step !== 2;
      if (a.step >= 3) v.filter.material.color.set('#f0d8a0');
    }
    if (this.job === 'lights') {
      v.lightsOn = a.step > 0 && a.step < 3;
      v.hazardsOn = a.step === 2;
    }
    if (this.job === 'battery') {
      v.terminals[1].material.color.copy(this.snapshot.terminals[1]);
      v.terminals[0].material.color.copy(this.snapshot.terminals[0]);
      if (a.step > 0 && a.step < 3) v.terminals[1].material.color.set('#ff8b64');
      if (a.step > 1 && a.step < 3) v.terminals[0].material.color.set('#8ad6ff');
    }
    if (['wiper', 'washer', 'plugs', 'pressure'].includes(this.job))
      v.applyServiceStep(this.job, a.step);
  }

  restore() {
    if (!this.snapshot) return;
    const v = this.vehicle,
      s = this.snapshot;
    v.setHood(s.hoodOpen);
    v.filterCoverLift = s.filterCoverLift;
    v.filterLift = s.filterLift;
    v.filter.visible = s.filterVisible;
    v.filter.material.color.copy(s.filterColor);
    v.lightsOn = s.lightsOn;
    v.hazardsOn = s.hazardsOn;
    v.activeWheel.visible = s.wheelVisible;
    v.bolts.forEach((bolt, i) => {
      bolt.visible = s.bolts[i].visible;
      bolt.material.color.copy(s.bolts[i].color);
    });
    v.terminals.forEach((terminal, i) => terminal.material.color.copy(s.terminals[i]));
    Object.assign(v, s.serviceParts);
    v.applyServiceVisuals();
    this.snapshot = null;
    this.activity = null;
    this.job = null;
  }
}
