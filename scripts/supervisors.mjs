export const supervisorPromoterMap = {
  "BRUNO ISMAEL": [
    "NICASTRO LUCAS",
    "POCHETINO NICOLAS",
    "SIRI MARTIN",
    "GARCIA MATIAS",
    "VILLAGRA ENZO",
    "FUENTEALBA MAURICIO",
    "JARAMILLO JORDAN",
    "FABRE GASTON",
    "GASTON FABRE"
  ],
  "CASCO HERNAN": [
    "MENDEZ CARLOS",
    "FIELG FERNANDO",
    "ALVAREZ PABLO",
    "ROJAS ALEXANDER",
    "GIMENEZ JUAN MANUEL",
    "MORENI LUCIANO",
    "HERRERA MARIANO",
    "ALEXANDER ROJAS",
    "FERNANDO FIELG",
    "JUAN MANUEL GIMENEZ"
  ],
  "VITI ANIBAL": [
    "FEDERICO BISS"
  ]
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function variants(name) {
  const normalized = normalizeName(name);
  const parts = normalized.split(" ");
  const reversed = parts.length === 2 ? `${parts[1]} ${parts[0]}` : normalized;
  return [normalized, reversed];
}

const promoterToSupervisor = new Map();
for (const [supervisor, promoters] of Object.entries(supervisorPromoterMap)) {
  for (const promoter of promoters) {
    for (const variant of variants(promoter)) promoterToSupervisor.set(variant, supervisor);
  }
}

export function supervisorForPromoter(promoter) {
  return promoterToSupervisor.get(normalizeName(promoter)) || "Sin supervisor";
}
