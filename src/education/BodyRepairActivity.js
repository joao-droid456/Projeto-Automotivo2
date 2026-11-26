const parts = {
  front: 'Para-choque dianteiro',
  rear: 'Para-choque traseiro',
  side: 'Painel lateral',
};
const distractors = {
  front: ['Farol dianteiro', 'Retrovisor esquerdo'],
  rear: ['Lanterna traseira', 'Para-choque dianteiro'],
  side: ['Para-choque dianteiro', 'Lanterna traseira'],
};

export const repairSteps = [
  { id: 'fasteners', title: 'Soltar os fixadores', instruction: 'Remova os quatro fixadores que prendem a peça amassada. Clique em cada um.' },
  { id: 'hammer', title: 'Desamassar a lataria', instruction: 'Arraste o martelo pelo mapa e acerte cada amassado marcado.' },
  { id: 'install', title: 'Instalar a peça nova', instruction: 'Escolha a peça de reposição certa para o dano.' },
  { id: 'torque', title: 'Apertar os parafusos', instruction: 'Aperte os parafusos na sequência 1 · 2 · 3 · 4.' },
];

export class BodyRepairActivity {
  constructor(zone = 'front') {
    this.zone = parts[zone] ? zone : 'front';
    this.stage = 0;
    this.fasteners = [false, false, false, false];
    this.dents = [false, false, false, false];
    this.torqueOrder = 0;
    this.mistakes = 0;
    this.completed = false;
  }

  get current() {
    return this.completed ? null : repairSteps[this.stage];
  }

  get part() {
    return parts[this.zone];
  }

  get options() {
    const [first, second] = distractors[this.zone];
    return [first, this.part, second];
  }

  guard(step) {
    if (this.completed) return { ok: false, message: 'A funilaria já foi concluída.' };
    if (this.current.id !== step) return { ok: false, message: 'Conclua a etapa atual primeiro.' };
    return null;
  }

  loosen(index) {
    const blocked = this.guard('fasteners');
    if (blocked) return blocked;
    if (!Number.isInteger(index) || index < 0 || index > 3) return { ok: false, message: 'Fixador inexistente.' };
    if (this.fasteners[index]) return { ok: false, message: 'Este fixador já foi solto.' };
    this.fasteners[index] = true;
    const left = this.fasteners.filter(value => !value).length;
    if (left) return { ok: true, message: `Fixador ${index + 1} solto · faltam ${left}.` };
    this.stage++;
    return { ok: true, message: 'Peça solta. Agora martele os amassados da lataria.' };
  }

  strike(index) {
    const blocked = this.guard('hammer');
    if (blocked) return blocked;
    if (!Number.isInteger(index) || index < 0 || index > 3) return { ok: false, message: 'Ponto inexistente no mapa.' };
    if (this.dents[index]) return { ok: false, message: 'Este amassado já foi corrigido.' };
    this.dents[index] = true;
    const left = this.dents.filter(value => !value).length;
    if (left) return { ok: true, message: `Amassado ${index + 1} alisado · faltam ${left}.` };
    this.stage++;
    return { ok: true, message: 'Lataria alinhada. Instale a peça de reposição.' };
  }

  install(name) {
    const blocked = this.guard('install');
    if (blocked) return blocked;
    if (name !== this.part) {
      this.mistakes++;
      return { ok: false, message: `Essa peça não corresponde ao dano. Escolha ${this.part.toLowerCase()}.` };
    }
    this.stage++;
    return { ok: true, message: `${this.part} instalado. Aperte os parafusos na ordem correta.` };
  }

  torque(number) {
    const blocked = this.guard('torque');
    if (blocked) return blocked;
    if (number !== this.torqueOrder + 1) {
      this.mistakes++;
      this.torqueOrder = 0;
      return { ok: false, message: `Sequência incorreta para o parafuso ${number}. Recomece em 1 · 2 · 3 · 4.` };
    }
    this.torqueOrder++;
    if (this.torqueOrder < 4) return { ok: true, message: `Parafuso ${number} apertado · ${this.torqueOrder}/4.` };
    this.completed = true;
    return { ok: true, message: 'Peça alinhada e parafusos conferidos. Funilaria concluída.' };
  }
}