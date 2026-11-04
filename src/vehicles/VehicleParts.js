const part = (name, description) => ({ name, description });

export const VEHICLE_PARTS = {
  'cabin-floor': part('Assoalho da cabine', 'Piso do habitáculo, com espaço para os pés e apoio dos bancos.'),
  'front-seat': part(
    'Banco dianteiro',
    'Assento e encosto para motorista ou passageiro, com apoios laterais.',
  ),
  'rear-seat': part(
    'Banco traseiro',
    'Assento e encosto traseiros com três posições representadas nesta cabine didática.',
  ),
  headrest: part(
    'Apoio de cabeça',
    'Apoio junto ao encosto do banco, representado com suas hastes de sustentação.',
  ),
  'seat-belt': part(
    'Cinto e fecho',
    'Conjunto de retenção dos ocupantes, com faixa e pontos de engate junto aos bancos.',
  ),
  dashboard: part(
    'Painel de bordo',
    'Estrutura dianteira da cabine que reúne instrumentos, saídas de ar e controles.',
  ),
  'instrument-panel': part(
    'Quadro de instrumentos',
    'Mostradores diante do motorista. As indicações são ilustrativas nesta simulação.',
  ),
  'steering-wheel': part(
    'Volante',
    'Comando de direção à frente do motorista, com aro, raios e região central.',
  ),
  'center-console': part(
    'Console central',
    'Área entre os bancos dianteiros que reúne os comandos centrais.',
  ),
  'gear-lever': part(
    'Alavanca de câmbio',
    'Comando representado para seleção das marchas. Esta cabine é uma representação genérica.',
  ),
  handbrake: part('Freio de estacionamento', 'Alavanca manual representada junto ao console central.'),
  infotainment: part(
    'Central multimídia',
    'Tela ilustrativa no centro do painel; não possui aplicativos ativos.',
  ),
  'air-vent': part('Saída de ventilação', 'Difusor de ar do painel, representado com aletas horizontais.'),
  pedals: part(
    'Pedais',
    'Comandos aos pés do motorista: embreagem, freio e acelerador nesta representação genérica.',
  ),
  'door-trim': part('Forro da porta', 'Revestimento interno da porta com apoio de braço e puxador.'),
  'rearview-mirror': part(
    'Retrovisor interno',
    'Espelho central da cabine para observação da região traseira.',
  ),
  body: part('Carroceria', 'Painéis externos que formam a estrutura e o acabamento do veículo.'),
  wheel: part('Roda e pneu', 'O pneu faz contato com o piso; o aro é fixado ao cubo por fixadores.'),
  'wheel-support': part(
    'Apoio fixo didático',
    'Representa o apoio do eixo desta roda na simulação. A conferência virtual não substitui a verificação dos pontos de apoio, imobilização e equipamentos adequados em treinamento supervisionado.',
  ),
  tire: part(
    'Pneu',
    'Componente de borracha montado no aro. Sustenta a carga do veículo e participa da aderência, da frenagem e da absorção de pequenas irregularidades do piso.',
  ),
  'tire-tread': part(
    'Banda de rodagem do pneu',
    'Faixa externa do pneu que toca o piso. Os blocos e sulcos participam da aderência e do escoamento de água; observe o desgaste e a integridade dessa superfície.',
  ),
  'wheel-rim': part(
    'Aro da roda',
    'Estrutura metálica na qual o pneu é assentado. Suas bordas mantêm o pneu posicionado; não é a calota nem a parte de borracha.',
  ),
  'wheel-spoke': part(
    'Raio da roda',
    'Elemento estrutural que liga a região central ao aro. Nesta roda, os raios metálicos são parte da roda, e não uma calota que cobre toda a sua face.',
  ),
  'wheel-center-cap': part(
    'Calota central da roda',
    'Pequena tampa de acabamento no centro da roda. É diferente de uma calota integral, que cobre grande parte da face de uma roda de aço; não substitui os fixadores.',
  ),
  'wheel-fastener': part(
    'Fixador da roda',
    'Parafuso de fixação representado neste conjunto didático. Prende a roda ao cubo; o aperto deve seguir a sequência e a especificação aplicáveis ao veículo.',
  ),
  'wheel-hub': part(
    'Cubo da roda',
    'Região de apoio e centralização da roda no eixo. A superfície de assentamento e os alojamentos dos fixadores precisam estar íntegros para a montagem.',
  ),
  'wheel-opening': part(
    'Abertura da roda',
    'Recorte representado na face metálica da roda. Não é um fixador: faz parte do desenho da roda e permite circulação de ar junto ao conjunto de freio.',
  ),
  hood: part('Capô', 'Protege o compartimento do motor. Abra para acessar os componentes disponíveis.'),
  engine: part(
    'Motor',
    'Conjunto que transforma energia em movimento. Observe os componentes do compartimento.',
  ),
  filter: part(
    'Filtro de ar',
    'Retém impurezas do ar admitido pelo motor. A prática permite abrir a caixa e substituir o filtro.',
  ),
  battery: part(
    'Bateria de 12 V',
    'Acumulador de energia do circuito de 12 V. Possui terminais positivo e negativo; a prática simula a medição entre esses terminais, sem avaliar um sistema de alta tensão.',
  ),
  lights: part(
    'Faróis e sinalização',
    'Permitem iluminar a via e sinalizar o veículo. Teste faróis e pisca-alerta.',
  ),
  glass: part('Vidros', 'Superfícies de visibilidade do habitáculo. Gire e aproxime para examinar.'),
  roof: part('Teto', 'Parte superior da carroceria que protege o habitáculo.'),
  mirror: part(
    'Retrovisor externo',
    'Conjunto lateral de espelho e carcaça. Amplia a visão das laterais e da região traseira; sua regulagem e seu campo de visão diferem dos do retrovisor interno.',
  ),
  trunk: part('Porta-malas', 'Região traseira destinada à bagagem. Este modelo possui tampa fixa.'),
  suspension: part(
    'Suspensão',
    'Braços, molas e amortecedores ligam as rodas à estrutura e controlam seus movimentos.',
  ),
  oilPan: part(
    'Cárter',
    'Reservatório inferior de óleo do motor representado neste modelo. O bujão permite a drenagem; não deve ser confundido com a carcaça da transmissão. A troca de óleo continua disponível nos elevadores.',
  ),
  exhaust: part(
    'Escapamento',
    'Conduz os gases de escape, com catalisador e silencioso na representação inferior.',
  ),
  transmission: part('Transmissão e semieixos', 'Transmitem o movimento do motor às rodas motrizes.'),
  fuelTank: part('Tanque de combustível', 'Reservatório representado na parte inferior traseira do veículo.'),
  brakes: part('Sistema de freios', 'Conjunto e tubulações relacionados à desaceleração do veículo.'),
  chassis: part(
    'Assoalho e estrutura inferior',
    'Longarinas, travessas e painéis sustentam os conjuntos do veículo.',
  ),
  cover: part('Capa do veículo', 'Cobertura protetora. As peças sob a capa não estão visíveis neste modelo.'),
  'front-bumper': part(
    'Para-choque dianteiro',
    'Acabamento na extremidade dianteira, junto à grade e às luzes.',
  ),
  'rear-bumper': part('Para-choque traseiro', 'Acabamento na extremidade traseira do veículo.'),
};
for (const [axle, axleName] of [
  ['front', 'dianteira'],
  ['rear', 'traseira'],
]) {
  for (const [side, sideName] of [
    ['left', 'esquerda'],
    ['right', 'direita'],
  ]) {
    VEHICLE_PARTS[`${axle}-wheel-${side}`] = part(
      `Roda ${axleName} ${sideName}`,
      'Conjunto formado pelo aro metálico, pneu e elementos de fixação. Passe sobre cada elemento para distingui-lo; a troca manual está disponível nas quatro rodas do carro didático.',
    );
    VEHICLE_PARTS[`${axle}-door-${side}`] = part(
      `Porta ${axleName} ${sideName}`,
      'Acesso ao habitáculo. Examine o painel, os vidros e as maçanetas; a porta deste modelo é fixa.',
    );
  }
}

export function inheritedPartId(object) {
  for (let node = object; node; node = node.parent) {
    if (node.userData.inspectionPart) return node.userData.inspectionPart;
  }
  return null;
}

/** Triangle ranges survive geometry merging, preserving the existing draw-call budget. */
export function inspectionFaceRanges(object, offset = 0) {
  if (object.userData.inspectionFaces)
    return object.userData.inspectionFaces.map(range => ({
      ...range,
      start: range.start + offset,
      end: range.end + offset,
    }));
  const id = inheritedPartId(object);
  const triangles = (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
  return id ? [{ id, start: offset, end: offset + triangles }] : [];
}

export function classifyVehiclePoint(point) {
  const { x, y, z } = point,
    side = z >= 0 ? 'left' : 'right';
  for (const [axle, wheelX] of [
    ['front', -1.24],
    ['rear', 1.21],
  ]) {
    if (Math.abs(z) > 0.72 && Math.hypot(x - wheelX, y - 0.4) < 0.43) return `${axle}-wheel-${side}`;
  }
  if (x < -1.84 && y > 0.68 && y < 1.08 && Math.abs(z) > 0.3) return 'lights';
  if (Math.abs(z) > 0.84 && x > -0.95 && x < -0.45 && y > 1.1) return 'mirror';
  if (y > 1.58) return 'roof';
  if (y > 1.2) return 'glass';
  if (Math.abs(z) > 0.7 && x > -0.86 && x < 1.1 && y > 0.6)
    return `${x < 0.38 ? 'front' : 'rear'}-door-${side}`;
  if (x > 1.1 && y > 1) return 'trunk';
  if (x < -1.85 && y < 0.75) return 'front-bumper';
  if (x > 1.85 && y < 0.75) return 'rear-bumper';
  return 'body';
}

export function partFromHit(hit, root, procedural = false) {
  const object = hit.object;
  let id = object.userData.inspectionInstances?.[hit.instanceId];
  id ||= object.userData.inspectionFaces?.find(
    range => hit.faceIndex >= range.start && hit.faceIndex < range.end,
  )?.id;
  id ||= inheritedPartId(object);
  const material = Array.isArray(object.material)
    ? object.material[hit.face?.materialIndex || 0]
    : object.material;
  if (!id && procedural) {
    id = classifyVehiclePoint(root.worldToLocal(hit.point.clone()));
    if (material?.userData.inspectionPart && id !== 'mirror') id = material.userData.inspectionPart;
  }
  id ||= material?.userData.inspectionPart;
  id ||= 'body';
  // Keep the existing wheel activity available when selecting one of its finer-grained components.
  let actionId = id;
  if (id === 'tire' || id.startsWith('tire-') || id.startsWith('wheel-')) {
    for (let node = object; node; node = node.parent) {
      if (/^(front|rear)-wheel-(left|right)$/.test(node.userData.inspectionPart || '')) {
        actionId = node.userData.inspectionPart;
        break;
      }
    }
    if (actionId === id && procedural) {
      const region = classifyVehiclePoint(root.worldToLocal(hit.point.clone()));
      if (/^(front|rear)-wheel-(left|right)$/.test(region)) actionId = region;
    }
  }
  const definition = VEHICLE_PARTS[id];
  return definition
    ? {
        id,
        actionId,
        ...definition,
        object,
        point: hit.point.clone(),
        localPoint: object.worldToLocal(hit.point.clone()),
      }
    : {
        id,
        actionId,
        name: object.userData.inspectionName || object.name || 'Componente',
        description: object.userData.inspectionDescription || 'Componente do veículo selecionado.',
        object,
        point: hit.point.clone(),
        localPoint: object.worldToLocal(hit.point.clone()),
      };
}
