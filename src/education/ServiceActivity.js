export const jobs = {
  filter: { title: 'Trocar filtro de ar', steps: ['Clique na tampa para abrir a caixa.', 'Retire o filtro usado.', 'Encaixe o filtro novo.', 'Feche a tampa.'], targets: ['cover', 'filter', 'filter', 'cover'] },
  battery: { title: 'Testar bateria', steps: ['Encoste a ponta vermelha no terminal +.', 'Encoste a ponta preta no terminal −.', 'Leia o multímetro e desconecte as pontas.'], targets: ['positive', 'negative', 'meter'] },
  lights: { title: 'Testar luzes', steps: ['Acenda os faróis.', 'Ligue o pisca-alerta.', 'Desligue as luzes para finalizar.'], targets: ['headlights', 'hazards', 'off'] },
  wiper: { title: 'Trocar palheta do limpador', steps: ['Levante o braço do limpador.', 'Solte a palheta usada.', 'Encaixe a palheta nova.', 'Apoie a palheta no vidro.'], targets: ['wiper-arm', 'wiper-blade', 'wiper-blade', 'wiper-arm'] },
  washer: { title: 'Completar lavador de para-brisa', steps: ['Abra a tampa do reservatório.', 'Verifique o nível do fluido.', 'Complete com fluido até a marca.', 'Feche a tampa.'], targets: ['washer-cap', 'washer', 'washer', 'washer-cap'] },
  plugs: { title: 'Trocar vela de ignição', steps: ['Desencaixe a bobina de ignição.', 'Retire a vela usada.', 'Rosqueie a vela nova.', 'Reconecte a bobina.'], targets: ['ignition-coil', 'spark-plug', 'spark-plug', 'ignition-coil'] },
  pressure: { title: 'Calibrar pressão dos pneus', steps: ['Remova a tampa da válvula.', 'Encaixe o manômetro.', 'Leia 32 psi e complete o ar.', 'Recoloque a tampa da válvula.'], targets: ['tire-valve', 'tire-gauge', 'tire-gauge', 'tire-valve'] },
};

export class ServiceActivity {
  constructor(id) { this.id = id; this.definition = jobs[id]; if (!this.definition) throw new Error('Serviço desconhecido'); this.step = 0; }
  get completed() { return this.step === this.definition.steps.length; }
  get target() { return this.definition.targets[this.step]; }
  perform(target) {
    if (this.completed || target !== this.target) return false;
    this.step++; return true;
  }
}
