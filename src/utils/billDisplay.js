const sanctionedLoads = { A: 12, B: 12, C: 9, D: 9, E: 6, F: 6, G: 6 };

export const sanctionedLoadForFlat = (flat, fallback = "") => {
  const flatName = String(flat ?? "").trim();
  const block = flatName.match(/^([A-G])(?:$|[\s-]?\d)/i)?.[1]?.toUpperCase();
  return block ? `${sanctionedLoads[block]} KW` : String(fallback ?? "").trim();
};
