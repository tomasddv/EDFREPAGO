import fs from "node:fs";
import path from "node:path";
import { supervisorForPromoter } from "./supervisors.mjs";

const sourceDir = process.env.EDF_SOURCE_DIR || "N:\\tomas\\DASHBOARDS\\REPAGO EDF";
const stagingDir = path.join(process.cwd(), "data", "staging");
const outputPath = path.join(process.cwd(), "data", "db.json");
const now = new Date();
const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const repaymentTargets = {
  "Vertical grande": 2.5,
  Mostrador: 1.6,
  Slim: 1.2,
  Sahara: 1.2,
  "Doble puerta": 3.2,
  Horizontal: 1.9,
  "3 bandejas": 1.6,
  "Baby visu": 1.6,
  "Vertical mediana": 1.9,
  "Check out": 1.6,
  "Full glass": 2.5,
  "Gondola de calidad": 3.2
};

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function key(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function code(value) {
  let text = clean(value);
  const match = text.match(/^\((\d+)\)/);
  if (match) text = match[1];
  if (/^\d+$/.test(text)) text = text.replace(/^0+/, "") || "0";
  return text;
}

function parseNumber(value) {
  const text = clean(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function readUtf16(file) {
  return fs.readFileSync(path.join(stagingDir, file), "utf16le").replace(/^\uFEFF/, "");
}

function rowsFromMaybe(file) {
  const fullPath = path.join(stagingDir, file);
  return fs.existsSync(fullPath) ? rowsFrom(file) : [];
}

function parseDelimited(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => line.split("\t").map(clean));
}

function rowsFrom(file) {
  const matrix = parseDelimited(readUtf16(file));
  if (!matrix.length) return [];
  let headerIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(12, matrix.length); i++) {
    const score = matrix[i].filter((cell) => /cliente|activo|serie|estado|localidad|direccion|ruta|vendedor|modelo|nombre|codigo/i.test(cell)).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }
  const headers = matrix[headerIndex].map((cell, index) => key(cell) || `col${index}`);
  return matrix.slice(headerIndex + 1).map((line) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = line[index] ?? "";
    });
    return row;
  });
}

function first(row, keys) {
  for (const item of keys) {
    if (clean(row[item])) return clean(row[item]);
  }
  return "";
}

function normalizeStatus(value, customerId) {
  if (customerId) return "PDV";
  const text = clean(value).toUpperCase();
  if (/REPAR|BAJA/.test(text)) return "REPARACION";
  if (/PDV|COLOC|CLIENT/.test(text)) return "PDV";
  if (/DEPOS|DEP/.test(text)) return "DEPOSITO";
  if (/STOCK|DISPON|CASA CENTRAL/.test(text)) return "STOCK";
  return "STOCK";
}

function normalizeDeposit(value) {
  const text = clean(value).toUpperCase();
  if (/MADRYN|PMY/.test(text)) return "MADRYN";
  if (/TRELEW|CASA CENTRAL|REL|TREL/.test(text)) return "TRELEW";
  return "INTERIOR";
}

function depositFromCode(codeValue, fallbackValue) {
  const depCode = code(codeValue);
  if (depCode === "8") return "TRELEW";
  if (depCode === "14") return "MADRYN";
  return normalizeDeposit(fallbackValue);
}

function guessModel(row) {
  const raw = `${first(row, ["modelo", "codmodelo", "descripcionarticulo", "descproducto", "producto"])} ${first(row, ["unidaddenegocio", "un"])}`.toUpperCase();
  if (/\bBV\b|BABY/.test(raw)) return "Baby visu";
  if (/VERT.*GRAN|VG/.test(raw)) return "Vertical grande";
  if (/VERT.*MED|VM/.test(raw)) return "Vertical mediana";
  if (/DOBLE|2P|DP/.test(raw)) return "Doble puerta";
  if (/FULL|GLASS/.test(raw)) return "Full glass";
  if (/HORIZ/.test(raw)) return "Horizontal";
  if (/SAHARA/.test(raw)) return "Sahara";
  if (/SLIM/.test(raw)) return "Slim";
  if (/MOST/.test(raw)) return "Mostrador";
  if (/3.*BAN/.test(raw)) return "3 bandejas";
  return "Mostrador";
}

function businessFromValue(value, category = "", brand = "") {
  const text = `${clean(value)} ${clean(category)} ${clean(brand)}`.toUpperCase();
  if (/RED BULL|\bRB\b|REDBULL/.test(text)) return "RB";
  if (/AGUAS|AGUA|ECO/.test(text)) return "AGUAS";
  if (/CERVE|CMQ|CZA/.test(text)) return "CZA";
  if (/UNG|GASEOS|ISOTON|ENERG|H2OH|SABORIZ/.test(text)) return "UNG";
  return "OTROS";
}

function businessFromEdfColumns(un, logo, product = "") {
  const unText = clean(un).toUpperCase();
  const logoText = clean(logo).toUpperCase();
  const productText = clean(product).toUpperCase();
  if (/CERVE|CMQ|CZA/.test(unText)) return "CZA";
  if (/AGUAS|AGUA|ECO/.test(unText)) return "AGUAS";
  if (/RED BULL|\bRB\b|REDBULL/.test(`${logoText} ${productText}`)) return "RB";
  if (/UNG|GASEOS|ISOTON|ENERG|H2OH|SABORIZ/.test(`${unText} ${logoText} ${productText}`)) return "UNG";
  return businessFromValue(`${unText} ${logoText}`, productText);
}

function emptySalesByBusiness() {
  return { CZA: 0, UNG: 0, AGUAS: 0, RB: 0, OTROS: 0 };
}

function emptyMonthlySales() {
  return { CZA: {}, UNG: {}, AGUAS: {}, RB: {}, OTROS: {} };
}

function addBusinessSale(customer, business, period, hl) {
  customer.salesByBusiness[business] = Number(((customer.salesByBusiness[business] || 0) + hl).toFixed(2));
  customer.monthlySalesByBusiness[business][period] = Number(((customer.monthlySalesByBusiness[business][period] || 0) + hl).toFixed(2));
}

function periodKey(cols) {
  const description = clean(cols[2]).toLowerCase();
  const match = description.match(/([a-záéíóúñ]{3})-(\d{2})/i);
  const monthNames = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12
  };
  if (match) {
    const month = monthNames[match[1].normalize("NFD").replace(/\p{Diacritic}/gu, "")] || Number(cols[1]);
    const year = 2000 + Number(match[2]);
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return `2026-${String(Number(cols[1]) || new Date().getMonth() + 1).padStart(2, "0")}`;
}

const semaforo = rowsFrom("semaforo.tsv");
const edfRows = [...rowsFrom("edf1.tsv"), ...rowsFrom("edf2.tsv")];
const clientRows = rowsFrom("clientes.tsv");
const piRows = [
  ...rowsFromMaybe("pi-cza.tsv").map((row) => ({ ...row, __piType: "CZA" })),
  ...rowsFromMaybe("pi-ung.tsv").map((row) => ({ ...row, __piType: "UNG" })),
  ...rowsFromMaybe("pi-rb.tsv").map((row) => ({ ...row, __piType: "RB" }))
];

const assetBySerial = new Map();
for (const row of edfRows) {
  const serial = first(row, ["numerodeserie", "nroserie", "serie", "serial"]);
  const asset = first(row, ["numerodeactivo", "nrodeactivo", "activo", "nroactivo"]);
  if (serial && asset && !assetBySerial.has(serial)) assetBySerial.set(serial, asset);
}

const customers = new Map();
for (const row of clientRows) {
  const id = code(first(row, ["cliente", "codcliente", "codigocliente", "nrocliente"]));
  if (!id || id === "0") continue;
  customers.set(id, {
    id,
    name: first(row, ["nombredefantasia", "razonsocial", "nombre", "cliente"]),
    address: [first(row, ["calle", "direccion", "domicilio"]), first(row, ["altura"])].filter(Boolean).join(" "),
    city: first(row, ["localidad", "codigolocalidad", "ciudad"]),
    route: first(row, ["ruta", "recorrido"]),
    seller: first(row, ["vendedor", "preventista"]),
    pi: false,
    piTypes: [],
    potentialPi: false,
    annualHl: 0,
    salesByBusiness: emptySalesByBusiness(),
    monthlySalesByBusiness: emptyMonthlySales(),
    categories: [],
    brands: []
  });
}

const piIds = new Set();
const piTypesByCustomer = new Map();
for (const row of piRows) {
  const distributorCode = code(first(row, ["codigodistribuidor", "coddistribuidor", "codigodirectadistri", "codigodirectadistri", "codigodistri"]));
  const distributorName = key(first(row, ["distribuidor", "directadistri", "distridirecta"]));
  if (distributorCode !== "70549" && !distributorName.includes("distribuidoradelvalle")) continue;
  let id = code(first(row, ["codigocliente", "codcliente", "beescodcliente", "cliente"]));
  if (!id) {
    const composite = code(first(row, ["beescodcliente", "concat"]));
    id = composite.startsWith("70549") ? code(composite.slice(5)) : composite;
  }
  if (id.startsWith("70549") && id.length > 5) id = code(id.slice(5));
  if (id && id !== "0") {
    piIds.add(id);
    if (!piTypesByCustomer.has(id)) piTypesByCustomer.set(id, new Set());
    piTypesByCustomer.get(id).add(row.__piType);
  }
}
for (const id of piIds) {
  const customer = customers.get(id);
  if (customer) {
    customer.pi = true;
    customer.piTypes = [...(piTypesByCustomer.get(id) || [])];
  }
}

const sourceSalesFiles = fs.readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const fullPath = path.join(sourceDir, entry.name);
    return { name: entry.name, path: fullPath, modified: fs.statSync(fullPath).mtimeMs };
  });
const baseSalesFile = sourceSalesFiles.find((file) => /^venta\.txt$/i.test(file.name));
const dailySalesFiles = sourceSalesFiles
  .filter((file) => /^venta.*\.txt$/i.test(file.name) && !/^venta\.txt$/i.test(file.name))
  .sort((a, b) => b.modified - a.modified);
const salesFiles = [baseSalesFile, ...dailySalesFiles].filter(Boolean).map((file) => file.path);
const salesFileInfos = salesFiles.map((salesPath) => {
  const rows = fs.readFileSync(salesPath, "utf8").split(/\r?\n/).filter(Boolean);
  const totals = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split("\t");
    const period = periodKey(cols);
    totals.set(period, Number(((totals.get(period) || 0) + parseNumber(cols[40])).toFixed(2)));
  }
  return { path: salesPath, rows, isDaily: !/^venta\.txt$/i.test(path.basename(salesPath)), totals };
});
const baseMonthlyTotals = new Map();
for (const info of salesFileInfos.filter((file) => !file.isDaily)) {
  for (const [period, total] of info.totals.entries()) {
    baseMonthlyTotals.set(period, Number(((baseMonthlyTotals.get(period) || 0) + total).toFixed(2)));
  }
}
const previousMonthAverage = (() => {
  const totals = [...baseMonthlyTotals.entries()]
    .filter(([period]) => period.startsWith(`${now.getFullYear()}-`) && period !== currentPeriod)
    .map(([, total]) => total)
    .filter((total) => total > 0);
  return totals.length ? totals.reduce((sum, total) => sum + total, 0) / totals.length : 0;
})();
const skippedDailyFiles = [];
const dailyPeriodsToReplace = new Set();
const skippedDailyPaths = new Set();
const dailyPeriodSources = new Map();
for (const info of salesFileInfos.filter((file) => file.isDaily)) {
  let skip = false;
  for (const [period, total] of info.totals.entries()) {
    const reference = Math.max(baseMonthlyTotals.get(period) || 0, previousMonthAverage, 1);
    if (total > 15000 && total > reference * 2.5) {
      skip = true;
      skippedDailyFiles.push(`${path.basename(info.path)} (${period}: ${total.toFixed(2)} no parece HL)`);
    }
  }
  if (skip) skippedDailyPaths.add(info.path);
  else {
    for (const period of info.totals.keys()) {
      const current = dailyPeriodSources.get(period);
      const modified = fs.statSync(info.path).mtimeMs;
      if (!current || modified > current.modified) dailyPeriodSources.set(period, { path: info.path, modified });
      dailyPeriodsToReplace.add(period);
    }
  }
}
let ventaRows = 0;
let dailyRows = 0;
for (const info of salesFileInfos) {
  if (skippedDailyPaths.has(info.path)) continue;
  for (let i = 1; i < info.rows.length; i++) {
    ventaRows += 1;
    if (info.isDaily) dailyRows += 1;
    const cols = info.rows[i].split("\t");
  const id = code(cols[4]);
  if (!id || id === "0") continue;
  if (!customers.has(id)) {
    customers.set(id, {
      id,
      name: clean(cols[5]),
      address: clean(cols[10]),
      city: "",
      route: clean(cols[8]),
      seller: clean(cols[15]),
      pi: piIds.has(id),
      piTypes: [...(piTypesByCustomer.get(id) || [])],
      potentialPi: false,
      annualHl: 0,
      salesByBusiness: emptySalesByBusiness(),
      monthlySalesByBusiness: emptyMonthlySales(),
      categories: [],
      brands: []
    });
  }
  const customer = customers.get(id);
  const hl = parseNumber(cols[40]);
    const business = businessFromValue(cols[35], cols[26], cols[20]);
    const period = periodKey(cols);
    if (!info.isDaily && dailyPeriodsToReplace.has(period)) continue;
  if (info.isDaily && dailyPeriodSources.get(period)?.path !== info.path) continue;
  customer.annualHl = Number((customer.annualHl + hl).toFixed(2));
  customer.salesByBusiness ||= emptySalesByBusiness();
  customer.monthlySalesByBusiness ||= emptyMonthlySales();
  addBusinessSale(customer, business, period, hl);
  if (business === "RB") addBusinessSale(customer, "UNG", period, hl);
  if (!customer.route) customer.route = clean(cols[8]);
  if (!customer.seller) customer.seller = clean(cols[15]);
  const category = clean(cols[26]).toLowerCase();
  const brand = clean(cols[20]);
  if (category && !customer.categories.includes(category)) customer.categories.push(category);
  if (brand && !customer.brands.includes(brand)) customer.brands.push(brand);
  }
}

const edfs = [];
const edfByUnique = new Map();
for (const row of semaforo) {
  const serial = first(row, ["nroserie", "numerodeserie", "serie", "serial"]);
  let asset = first(row, ["nrodeactivo", "numerodeactivo", "activo", "nroactivo"]);
  if (!asset && serial && assetBySerial.has(serial)) asset = assetBySerial.get(serial);
  if (!serial && !asset) continue;
  const unique = serial || asset;
  let customerId = code(first(row, ["codcliente", "cliente", "codigocliente", "nrocliente"]));
  if (customerId === "0") customerId = "";
  if (customerId && !customers.has(customerId)) {
    customers.set(customerId, {
      id: customerId,
      name: first(row, ["cliente"]),
      address: first(row, ["domicilio"]),
      city: "",
      route: "",
      seller: "",
      pi: piIds.has(customerId),
      piTypes: [...(piTypesByCustomer.get(customerId) || [])],
      potentialPi: false,
      annualHl: 0,
      salesByBusiness: emptySalesByBusiness(),
      monthlySalesByBusiness: emptyMonthlySales(),
      categories: [],
      brands: []
    });
  }
  const location = first(row, ["ubicacion", "origen", "descdeposito", "relaciondeposucursal"]);
  const candidate = {
    id: "",
    asset,
    serial,
    model: guessModel(row),
    business: businessFromEdfColumns(
      first(row, ["un", "unidaddenegocio"]),
      first(row, ["logo"]),
      first(row, ["descproducto", "descripcionarticulo"])
    ),
    status: normalizeStatus(location, customerId),
    depositCode: code(first(row, ["coddeposito"])),
    deposit: depositFromCode(first(row, ["coddeposito"]), first(row, ["descdeposito", "ubicacion", "relaciondeposucursal"])),
    customerId: customerId || null,
    source: "REPAGO EDF"
  };
  const existing = edfByUnique.get(unique);
  if (!existing || shouldReplaceEdf(existing, candidate)) edfByUnique.set(unique, candidate);
}

edfs.push(...[...edfByUnique.values()].map((edf, index) => ({ ...edf, id: `edf_${index + 1}` })));

function shouldReplaceEdf(existing, candidate) {
  const score = (edf) =>
    (edf.status === "PDV" ? 100 : 0) +
    (edf.customerId ? 50 : 0) +
    (edf.status === "REPARACION" ? -20 : 0) +
    (edf.status === "BAJA DEFINITIVA" ? -100 : 0) +
    (edf.asset ? 5 : 0);
  return score(candidate) > score(existing);
}

  for (const customer of customers.values()) {
  customer.promoter = customer.promoter || customer.seller || "Sin promotor";
  customer.supervisor = supervisorForPromoter(customer.promoter);
  if (!customer.pi && customer.annualHl >= 1.2) customer.potentialPi = true;
}

const db = {
  users: [{ id: "u_admin", name: "Operador EDF", role: "admin" }],
  customers: [...customers.values()].sort((a, b) => Number(a.id) - Number(b.id)),
  edfs,
  recipients: [
    { city: "TRELEW", recipients: "operaciones.trelew@empresa.com; ventas.trelew@empresa.com" },
    { city: "MADRYN", recipients: "operaciones.madryn@empresa.com" },
    { city: "INTERIOR", recipients: "logistica.interior@empresa.com" }
  ],
  movements: [],
  audit: [{
    id: crypto.randomUUID(),
    action: "IMPORTAR_REPAGO_EDF",
    user: "Sistema",
    at: new Date().toISOString(),
    changes: {
      sourceDir,
      edfs: edfs.length,
      customers: customers.size,
      piDistribuidoraDelValle: piIds.size,
      piCza: [...piTypesByCustomer.values()].filter((types) => types.has("CZA")).length,
      piUng: [...piTypesByCustomer.values()].filter((types) => types.has("UNG")).length,
      piRb: [...piTypesByCustomer.values()].filter((types) => types.has("RB")).length,
      semaforoRows: semaforo.length,
      edfRows: edfRows.length,
      ventaRows,
      ventaDiariaRows: dailyRows,
      salesFiles: salesFiles.map((file) => path.basename(file)),
      ventaDiariaReemplazaPeriodos: [...dailyPeriodsToReplace],
      ventaDiariaOmitida: skippedDailyFiles
    }
  }],
  piEvents: []
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(db, null, 2));
console.log(JSON.stringify(db.audit[0].changes, null, 2));
