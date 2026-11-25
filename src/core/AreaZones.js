const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function insideWorkshop(p, config) {
  return (
    Math.abs(p.x) < config.width / 2 - 0.25 &&
    p.z > -config.depth / 2 + 0.25 &&
    p.z < config.depth / 2 - 0.15
  );
}

/** Faixa de transição do portão: ali interior e pátio ficam visíveis juntos. */
export function resolveWorkshopArea(camera, focus, driving, config) {
  const g = config.reconstruction.gate;
  const bandX = clamp(g.width * 0.5 + 4, 6, 10);
  const inBand = p => Math.abs(p.x - g.x) < bandX && p.z > 4 && p.z < 20;
  const cameraInside = insideWorkshop(camera, config);
  const doorway = inBand(camera) || (driving && inBand(focus));
  const area = doorway ? 'both' : insideWorkshop(focus, config) ? 'inside' : 'outside';
  return { area, inside: cameraInside };
}
