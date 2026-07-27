import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supervisorForPromoter } from "./scripts/supervisors.mjs";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const DB_PATH = path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

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

const validStatuses = new Set(["STOCK", "PDV", "DEPOSITO", "REPARACION", "BAJA DEFINITIVA"]);
const validDeposits = new Set(["INTERIOR", "MADRYN", "TRELEW"]);
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

const seed = {
  users: [
    { id: "u_admin", name: "Operador EDF", role: "admin" },
    { id: "u_comercial", name: "Comercial", role: "ventas" }
  ],
  customers: [
    {
      id: "1001",
      name: "Autoservicio Patagonia",
      address: "Av. Roca 220",
      city: "TRELEW",
      route: "R-12",
      seller: "Mariela Cano",
      pi: true,
      potentialPi: false,
      annualHl: 3.8,
      categories: ["cervezas", "premium", "gaseosas", "aguas"],
      brands: ["Quilmes", "Stella Artois", "Pepsi", "Eco de los Andes"]
    },
    {
      id: "1002",
      name: "Kiosco La Esquina",
      address: "Belgrano 810",
      city: "MADRYN",
      route: "R-04",
      seller: "Diego Ferreyra",
      pi: false,
      potentialPi: true,
      annualHl: 1.1,
      categories: ["gaseosas", "energizantes"],
      brands: ["Pepsi", "Red Bull"]
    },
    {
      id: "1003",
      name: "Mercado Sur",
      address: "San Martin 1450",
      city: "INTERIOR",
      route: "R-21",
      seller: "Lucia Torres",
      pi: true,
      potentialPi: false,
      annualHl: 0,
      categories: [],
      brands: []
    },
    {
      id: "1004",
      name: "Despensa Central",
      address: "Mitre 377",
      city: "TRELEW",
      route: "R-12",
      seller: "Mariela Cano",
      pi: false,
      potentialPi: true,
      annualHl: 2.4,
      categories: ["cervezas", "retornables", "importadas"],
      brands: ["Quilmes", "Corona"]
    },
    {
      id: "1005",
      name: "Maxikiosco Norte",
      address: "España 502",
      city: "MADRYN",
      route: "R-07",
      seller: "Pablo Soria",
      pi: false,
      potentialPi: true,
      annualHl: 3.1,
      categories: ["cervezas", "sin alcohol", "latones", "gaseosas", "isotonicas"],
      brands: ["Quilmes", "Brahma", "Pepsi", "Gatorade"]
    }
  ],
  edfs: [
    { id: "edf_1", asset: "A-00091", serial: "SN-VG-8831", model: "Vertical grande", status: "PDV", deposit: "TRELEW", customerId: "1001", source: "Semaforo + EDF" },
    { id: "edf_2", asset: "A-00102", serial: "SN-MO-1102", model: "Mostrador", status: "PDV", deposit: "MADRYN", customerId: "1002", source: "Semaforo + EDF" },
    { id: "edf_3", asset: "A-00133", serial: "SN-SL-4509", model: "Slim", status: "STOCK", deposit: "INTERIOR", customerId: null, source: "Semaforo + EDF" },
    { id: "edf_4", asset: "A-00144", serial: "SN-DP-7751", model: "Doble puerta", status: "PDV", deposit: "INTERIOR", customerId: "1003", source: "Semaforo + EDF" },
    { id: "edf_5", asset: "A-00187", serial: "SN-HO-9017", model: "Horizontal", status: "REPARACION", deposit: "TRELEW", customerId: null, source: "Semaforo + EDF" },
    { id: "edf_6", asset: "A-00201", serial: "SN-FG-2201", model: "Full glass", status: "STOCK", deposit: "MADRYN", customerId: null, source: "Semaforo + EDF" },
    { id: "edf_7", asset: "", serial: "SN-XX-4040", model: "Sahara", status: "STOCK", deposit: "TRELEW", customerId: null, source: "Sin activo" }
  ],
  recipients: [
    { city: "TRELEW", recipients: "operaciones.trelew@empresa.com; ventas.trelew@empresa.com" },
    { city: "MADRYN", recipients: "operaciones.madryn@empresa.com" },
    { city: "INTERIOR", recipients: "logistica.interior@empresa.com" }
  ],
  movements: [],
  audit: [],
  piEvents: []
};

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    await saveDb(seed);
    return structuredClone(seed);
  }
}

async function saveDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase().replace("DEPÓSITO", "DEPOSITO").replace("REPARACIÓN", "REPARACION");
}

function statusLabel(status) {
  return status === "DEPOSITO" ? "DEPÓSITO" : status === "REPARACION" ? "REPARACIÓN" : status;
}

function repaymentTargetFor(model, business) {
  if (business === "RB") return 0.001;
  return repaymentTargets[model] || 1.6;
}

function attachComputed(db) {
  const normalizedCustomers = db.customers.map((customer) => normalizeCustomer(customer));
  const customers = new Map(normalizedCustomers.map((customer) => [customer.id, customer]));
  const edfs = db.edfs.map((edf) => {
    const customer = edf.customerId ? customers.get(edf.customerId) : null;
    const business = edf.business || businessFromEdf(edf);
    const target = repaymentTargetFor(edf.model, business);
    const missingMix = mixGaps(customer);
    return {
      ...edf,
      business,
      statusLabel: statusLabel(edf.status),
      customer,
      repayment: {
        target,
        minimum: Number((target * 0.75).toFixed(2)),
        hl: 0,
        pct: 0,
        band: bandFor(0, 0),
        periods: {}
      },
      mix: {
        ...missingMix,
        repays: false,
        priority: "Baja"
      }
    };
  });
  applyRepaymentAllocation(edfs);

  const alerts = buildAlerts(edfs, normalizedCustomers);
  const rankings = buildRankings(edfs, normalizedCustomers);
  const opportunities = buildOpportunities(edfs, normalizedCustomers);
  const stock = buildStock(edfs);

  return {
    ...db,
    customers: normalizedCustomers,
    edfs,
    metrics: {
      totalEdf: edfs.length,
      inStock: edfs.filter((e) => e.status === "STOCK" || e.status === "DEPOSITO").length,
      placed: edfs.filter((e) => e.status === "PDV").length,
      repair: edfs.filter((e) => e.status === "REPARACION").length,
      baja: edfs.filter((e) => e.status === "BAJA DEFINITIVA").length,
      belowRepayment: edfs.filter((e) => e.status === "PDV" && e.repayment.pct < 75).length,
      noSales: edfs.filter((e) => e.status === "PDV" && e.repayment.band.key === "venta0").length,
      alerts: alerts.length,
      piCustomers: db.customers.filter((customer) => customer.pi).length,
      piWithoutEdf: alerts.filter((a) => a.type === "CLIENTE_PI_SIN_EDF").length,
      repaymentCompliance: repaymentCompliance(edfs, "year"),
      byBusiness: metricsByBusiness(edfs, "year"),
      tracking: buildMonthlyTracking(edfs)
    },
    filters: {
      supervisors: uniqueSorted(normalizedCustomers.map((customer) => customer.supervisor)),
      promoters: uniqueSorted(normalizedCustomers.map((customer) => customer.promoter)),
      businesses: uniqueSorted(edfs.map((edf) => edf.business || "OTROS"))
    },
    stock,
    alerts,
    rankings,
    opportunities
  };
}

function applyRepaymentAllocation(edfs) {
  const periods = {
    year: (customer, business) => yearlyHl(customer, business, 2026),
    rolling: (customer, business) => rolling12Hl(customer, business, currentYear, currentMonth),
    month: (customer, business) => monthlyHl(customer, business, currentYear, currentMonth),
    quarter: (customer, business) => quarterAverageHl(customer, business, currentYear, currentMonth)
  };
  for (let month = 1; month <= currentMonth; month += 1) {
    periods[`m${String(month).padStart(2, "0")}`] = (customer, business) => monthlyHl(customer, business, currentYear, month);
  }
  const groups = new Map();
  for (const edf of edfs) {
    if (edf.status !== "PDV" || !edf.customer) {
      edf.repayment.periods = Object.fromEntries(Object.keys(periods).map((period) => [period, repaymentPeriod(0, edf.repayment.target)]));
      continue;
    }
    const key = `${edf.customer.id}::${edf.business}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edf);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => String(a.asset || a.serial || "").localeCompare(String(b.asset || b.serial || "")));
    for (const [period, getSales] of Object.entries(periods)) {
      const sourceSales = getSales(group[0].customer, group[0].business);
      let remaining = sourceSales;
      for (const edf of group) {
        const allocated = Math.max(0, Math.min(remaining, edf.repayment.target));
        edf.repayment.periods[period] = repaymentPeriod(allocated, edf.repayment.target, sourceSales);
        remaining = Number((remaining - allocated).toFixed(2));
      }
    }
  }

  for (const edf of edfs) {
    const year = edf.repayment.periods.year || repaymentPeriod(0, edf.repayment.target);
    edf.repayment.hl = year.hl;
    edf.repayment.pct = year.pct;
    edf.repayment.band = year.band;
    edf.mix.repays = year.pct >= 75;
    edf.mix.priority = mixPriorityFor(year.pct, edf.mix);
  }
}

function repaymentCompliance(edfs, period) {
  const active = edfs.filter((edf) => edf.status === "PDV");
  const compliant = active.filter((edf) => (edf.repayment.periods?.[period]?.pct ?? edf.repayment.pct) >= 75);
  return { active: active.length, compliant: compliant.length, pct: active.length ? Math.round((compliant.length / active.length) * 100) : 0 };
}

function buildMonthlyTracking(edfs) {
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const businesses = uniqueSorted(edfs.map((edf) => edf.business || "OTROS"));
  const months = Array.from({ length: currentMonth }, (_, index) => {
    const month = index + 1;
    const key = periodKey(currentYear, month);
    return { key, label: monthNames[index], month };
  });
  const allSeries = monthlyTrackingSeries(edfs, months);
  const byBusiness = businesses.map((business) => ({
    business,
    months: monthlyTrackingSeries(edfs.filter((edf) => (edf.business || "OTROS") === business), months)
  }));
  return { year: currentYear, months: allSeries, byBusiness };
}

function monthlyTrackingSeries(edfs, months) {
  const active = edfs.filter((edf) => edf.status === "PDV" && edf.customer);
  const groups = new Map();
  for (const edf of active) {
    const key = `${edf.customer.id}::${edf.business}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edf);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => String(a.asset || a.serial || "").localeCompare(String(b.asset || b.serial || "")));
  }
  return months.map(({ key, label, month }) => {
    let compliant = 0;
    let low = 0;
    let zeroSales = 0;
    let totalHl = 0;
    let totalTarget = 0;
    for (const group of groups.values()) {
      const business = group[0].business;
      const sourceSales = salesByMonth(group[0].customer, business, key);
      let remaining = sourceSales;
      totalHl += sourceSales;
      for (const edf of group) {
        totalTarget += edf.repayment.target;
        const allocated = Math.max(0, Math.min(remaining, edf.repayment.target));
        const period = repaymentPeriod(allocated, edf.repayment.target, sourceSales);
        if (period.pct >= 75) compliant += 1;
        else low += 1;
        if (period.band.key === "venta0") zeroSales += 1;
        remaining = Number((remaining - allocated).toFixed(2));
      }
    }
    const activeCount = active.length;
    return {
      key,
      label,
      month,
      active: activeCount,
      compliant,
      low,
      zeroSales,
      hl: Number(totalHl.toFixed(2)),
      target: Number(totalTarget.toFixed(2)),
      hlPct: totalTarget ? Math.round((totalHl / totalTarget) * 100) : 0,
      pct: activeCount ? Math.round((compliant / activeCount) * 100) : 0,
      compliancePct: activeCount ? Math.round((compliant / activeCount) * 100) : 0
    };
  });
}

function metricsByBusiness(edfs, period = "year") {
  const rows = new Map();
  for (const edf of edfs) {
    const business = edf.business || "OTROS";
    if (!rows.has(business)) rows.set(business, {
      business,
      total: 0,
      placed: 0,
      available: 0,
      repair: 0,
      baja: 0,
      belowRepayment: 0,
      noSales: 0,
      compliant: 0,
      compliancePct: 0
    });
    const row = rows.get(business);
    const repayment = edf.repayment.periods?.[period] || edf.repayment;
    row.total += 1;
    if (edf.status === "PDV") {
      row.placed += 1;
      if ((repayment.pct || 0) >= 75) row.compliant += 1;
      if ((repayment.pct || 0) < 75) row.belowRepayment += 1;
      if (repayment.band?.key === "venta0") row.noSales += 1;
    }
    if (edf.status === "STOCK" || edf.status === "DEPOSITO") row.available += 1;
    if (edf.status === "REPARACION") row.repair += 1;
    if (edf.status === "BAJA DEFINITIVA") row.baja += 1;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, compliancePct: row.placed ? Math.round((row.compliant / row.placed) * 100) : 0 }))
    .sort((a, b) => a.business.localeCompare(b.business));
}

function businessFromEdf(edf) {
  const text = `${edf.business || ""} ${edf.model || ""} ${edf.source || ""}`.toUpperCase();
  if (text.includes("AGUAS") || text.includes("AGUA")) return "AGUAS";
  if (text.includes("CZA") || text.includes("CERVEZA") || text.includes("CMQ")) return "CZA";
  if (text.includes("UNG")) return "UNG";
  if (text.includes("RB") || text.includes("RED BULL")) return "RB";
  return "OTROS";
}

function periodKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthKeysEnding(year, month, count) {
  const keys = [];
  let cursor = new Date(year, month - 1, 1);
  for (let index = 0; index < count; index++) {
    keys.unshift(periodKey(cursor.getFullYear(), cursor.getMonth() + 1));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return keys;
}

function salesByMonth(customer, business, key) {
  return customer?.monthlySalesByBusiness?.[business]?.[key] || 0;
}

function monthlyHl(customer, business, year, month) {
  return Number(salesByMonth(customer, business, periodKey(year, month)).toFixed(2));
}

function yearlyHl(customer, business, year) {
  const monthCount = year === currentYear ? currentMonth : 12;
  const total = Array.from({ length: monthCount }, (_, index) => periodKey(year, index + 1))
    .reduce((sum, key) => sum + salesByMonth(customer, business, key), 0);
  return Number((total / monthCount).toFixed(2));
}

function rolling12Hl(customer, business, year, month) {
  const total = monthKeysEnding(year, month, 12).reduce((sum, key) => sum + salesByMonth(customer, business, key), 0);
  return Number((total / 12).toFixed(2));
}

function quarterAverageHl(customer, business, year, month) {
  const keys = monthKeysEnding(year, month, 3);
  const total = keys.reduce((sum, key) => sum + salesByMonth(customer, business, key), 0);
  return Number((total / 3).toFixed(2));
}

function repaymentPeriod(hl, target, sourceHl = hl) {
  const pct = target ? Math.round((hl / target) * 100) : 0;
  return { hl: Number((hl || 0).toFixed(2)), pct, band: bandFor(hl, target ? hl / target : 0, sourceHl) };
}


function normalizeCustomer(customer) {
  const promoter = customer.promoter || customer.seller || "Sin promotor";
  return {
    ...customer,
    supervisor: customer.supervisor || supervisorForPromoter(promoter),
    promoter
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function bandFor(hl, ratio, sourceHl = hl) {
  const pct = ratio * 100;
  if (!sourceHl) return { key: "venta0", label: "Venta 0", color: "gray" };
  if (pct < 25) return { key: "0-25", label: "0%-25%", color: "red" };
  if (pct < 50) return { key: "25-50", label: "25%-50%", color: "orange" };
  if (pct < 75) return { key: "50-75", label: "50%-75%", color: "yellow" };
  return { key: "75+", label: "75%-+100%", color: pct >= 100 ? "green" : "lime" };
}

function mixGaps(customer) {
  const czaCategories = ["cervezas", "cervezas sin alcohol", "premium", "latones", "importadas"];
  const ungCategories = ["gaseosas", "aguas", "isotonicas", "energizantes", "h2oh", "red bull"];
  const czaBrands = ["QUILMES", "BRAHMA", "STELLA ARTOIS", "CORONA", "PATAGONIA", "ANDES ORIGEN", "BUDWEISER"];
  const ungBrands = ["PEPSI", "7 UP", "PASO DE LOS TOROS", "H2OH", "GATORADE", "RED BULL", "ECO DE LOS ANDES", "NESTLE PUREZA VITAL"];
  const categories = new Set((customer?.categories || []).map((c) => normalizeMixValue(c)));
  const currentBrands = uniqueSorted(customer?.brands || []);
  const normalizedBrands = new Set(currentBrands.map((brand) => normalizeMixValue(brand)));
  const hasBrand = (brand) => [...normalizedBrands].some((current) => current.includes(normalizeMixValue(brand)) || normalizeMixValue(brand).includes(current));
  return {
    currentCategories: [...categories],
    missingCza: czaCategories.filter((item) => !categories.has(normalizeMixValue(item))),
    missingUng: ungCategories.filter((item) => !categories.has(normalizeMixValue(item))),
    currentBrands,
    missingBrandsCza: customer ? czaBrands.filter((brand) => !hasBrand(brand)) : [],
    missingBrandsUng: customer ? ungBrands.filter((brand) => !hasBrand(brand)) : [],
    missingBrands: customer ? [...czaBrands, ...ungBrands].filter((brand) => !hasBrand(brand)) : []
  };
}

function normalizeMixValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mixPriorityFor(repaymentPct, mix) {
  const missing = mix.missingCza.length + mix.missingUng.length + mix.missingBrandsCza.length + mix.missingBrandsUng.length;
  if (repaymentPct >= 75 && missing >= 8) return "Alta";
  if (repaymentPct >= 75 && missing >= 4) return "Media";
  if (repaymentPct >= 50 && missing >= 8) return "Media";
  return "Baja";
}

function buildStock(edfs) {
  const deposits = {
    "8-TRELEW": { STOCK: 0, DEPOSITO: 0, REPARACION: 0, available: 0 },
    "14-MADRYN": { STOCK: 0, DEPOSITO: 0, REPARACION: 0, available: 0 },
    "BAJA/REPARACION": { STOCK: 0, DEPOSITO: 0, REPARACION: 0, "BAJA DEFINITIVA": 0, available: 0 }
  };
  for (const edf of edfs) {
    const depositKey = edf.status === "REPARACION" || edf.status === "BAJA DEFINITIVA"
      ? "BAJA/REPARACION"
      : edf.depositCode === "14" || edf.deposit === "MADRYN" ? "14-MADRYN"
      : edf.depositCode === "8" || edf.deposit === "TRELEW" ? "8-TRELEW"
      : null;
    if (!depositKey) continue;
    if (edf.status in deposits[depositKey]) deposits[depositKey][edf.status] += 1;
    if (edf.status === "STOCK" || edf.status === "DEPOSITO") deposits[depositKey].available += 1;
  }
  return deposits;
}

function buildAlerts(edfs, customers) {
  const alerts = [];
  const serials = new Map();
  const placedByCustomer = new Map();
  for (const edf of edfs) {
    if (edf.serial) serials.set(edf.serial, (serials.get(edf.serial) || 0) + 1);
    if (edf.status === "PDV" && edf.customerId) placedByCustomer.set(edf.customerId, (placedByCustomer.get(edf.customerId) || 0) + 1);
    if (edf.status === "PDV" && edf.repayment.hl === 0) alerts.push(alert("EDF_SIN_VENTA", "EDF sin venta", "critical", edf));
    if (edf.status === "PDV" && edf.repayment.pct < 75) alerts.push(alert("EDF_BAJO_75", "EDF bajo 75% repago", "warning", edf));
    if (!edf.asset) alerts.push(alert("EDF_SIN_ACTIVO", "EDF sin activo", "warning", edf));
    if (!edf.serial) alerts.push(alert("EDF_SIN_SERIE", "EDF sin serie", "critical", edf));
    if ((edf.status === "STOCK" || edf.status === "DEPOSITO") && edf.customerId) alerts.push(alert("STOCK_ASIGNADO", "EDF en stock asignado", "critical", edf));
    if (edf.status === "PDV" && edf.mix.missingCza.length + edf.mix.missingUng.length > 7) alerts.push(alert("MIX_INCOMPLETO", "EDF con mix incompleto", "info", edf));
  }
  for (const edf of edfs) {
    if (edf.serial && serials.get(edf.serial) > 1) alerts.push(alert("EDF_DUPLICADO", "EDF duplicado", "critical", edf));
  }
  for (const [customerId, count] of placedByCustomer) {
    if (count > 1) alerts.push({ id: `multi_${customerId}`, type: "CLIENTE_MULTI_EDF", label: "Cliente con mas de un EDF", severity: "warning", customerId, count });
  }
  const placedCustomerIds = new Set(edfs.filter((e) => e.status === "PDV").map((e) => e.customerId));
  for (const customer of customers) {
    if (customer.pi && !placedCustomerIds.has(customer.id)) {
      alerts.push({ id: `pi_${customer.id}`, type: "CLIENTE_PI_SIN_EDF", label: "Cliente PI sin EDF", severity: "info", customerId: customer.id, customerName: customer.name });
    }
  }
  return alerts;
}

function alert(type, label, severity, edf) {
  return { id: `${type}_${edf.id}`, type, label, severity, edfId: edf.id, asset: edf.asset, serial: edf.serial };
}

function buildRankings(edfs, customers) {
  const placed = edfs.filter((edf) => edf.status === "PDV");
  const customerRows = customerRepaymentRows(placed);
  const sellerMap = new Map();
  const routeMap = new Map();
  for (const edf of placed) {
    if (!edf.customer) continue;
    accumulate(sellerMap, edf.customer.seller, edf.repayment.pct);
    accumulate(routeMap, edf.customer.route, edf.repayment.pct);
  }
  return {
    worstCustomers: customerRows.filter((row) => row.zeroSales).slice(0, 5),
    bestCustomers: [...customerRows].sort((a, b) => b.pct - a.pct).slice(0, 5),
    noSales: placed.filter((e) => e.repayment.hl === 0),
    bestEdf: [...placed].sort((a, b) => b.repayment.hl - a.repayment.hl).slice(0, 5),
    worstSellers: averageRows(sellerMap).sort((a, b) => a.avg - b.avg).slice(0, 5),
    worstRoutes: averageRows(routeMap).sort((a, b) => a.avg - b.avg).slice(0, 5),
    supervisorsByBand: bandRanking(placed, (edf) => edf.customer?.supervisor || "Sin supervisor"),
    promotersByBand: bandRanking(placed, (edf) => edf.customer?.promoter || edf.customer?.seller || "Sin promotor")
  };
}

function customerRepaymentRows(edfs) {
  const groups = new Map();
  for (const edf of edfs) {
    if (!edf.customer) continue;
    const key = `${edf.customer.id}::${edf.business}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        customer: edf.customer,
        business: edf.business,
        model: "Total EDF",
        asset: edf.customer.id,
        target: 0,
        hl: 0,
        sourceHl: 0,
        count: 0,
        zeroSales: false
      });
    }
    const row = groups.get(key);
    row.target += edf.repayment.target;
    row.hl += edf.repayment.periods.year?.hl || 0;
    row.sourceHl = Math.max(row.sourceHl, yearlyHl(edf.customer, edf.business, 2026));
    row.count += 1;
  }
  return [...groups.values()].map((row) => {
    row.target = Number(row.target.toFixed(2));
    row.hl = Number(row.hl.toFixed(2));
    row.sourceHl = Number(row.sourceHl.toFixed(2));
    row.pct = row.target ? Math.round((row.sourceHl / row.target) * 100) : 0;
    row.zeroSales = row.sourceHl === 0;
    row.repayment = { pct: row.pct, band: bandFor(row.sourceHl, row.target ? row.sourceHl / row.target : 0, row.sourceHl) };
    return row;
  }).sort((a, b) => a.pct - b.pct || b.count - a.count);
}

function bandRanking(edfs, getName) {
  const rows = new Map();
  for (const edf of edfs) {
    const name = getName(edf);
    if (!rows.has(name)) rows.set(name, { name, total: 0, venta0: 0, "0-25": 0, "25-50": 0, "50-75": 0, "75+": 0 });
    const row = rows.get(name);
    row.total += 1;
    row[edf.repayment.band.key] += 1;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, critical: row.venta0 + row["0-25"] + row["25-50"] + row["50-75"] }))
    .sort((a, b) => b.critical - a.critical || b.total - a.total)
    .slice(0, 10);
}

function accumulate(map, key, value) {
  const row = map.get(key) || { total: 0, count: 0 };
  row.total += value;
  row.count += 1;
  map.set(key, row);
}

function averageRows(map) {
  return [...map.entries()].map(([name, row]) => ({ name, avg: Math.round(row.total / row.count), count: row.count }));
}

function buildOpportunities(edfs, customers) {
  const placed = edfs.filter((e) => e.status === "PDV");
  const placedCustomerIds = new Set(placed.map((e) => e.customerId));
  const placedByCustomer = new Map();
  for (const edf of placed) {
    if (!placedByCustomer.has(edf.customerId)) placedByCustomer.set(edf.customerId, []);
    placedByCustomer.get(edf.customerId).push(edf);
  }
  const availableModels = edfs.filter((e) => e.status === "STOCK" || e.status === "DEPOSITO").map((e) => e.model);
  return customers
    .map((customer) => ({ customer, avgHl: customerOpportunityAverage(customer), placed: placedByCustomer.get(customer.id) || [] }))
    .filter((row) => (!placedCustomerIds.has(row.customer.id) && row.avgHl >= 1.2) || (row.customer.pi && row.placed.length > 0))
    .map((customer) => {
      const row = customer.customer ? customer : { customer, avgHl: customerOpportunityAverage(customer), placed: [] };
      const model = chooseModel(row.avgHl, availableModels);
      const target = repaymentTargets[model] || 1.6;
      const projectedPeriods = opportunityProjectionPeriods(row.customer, target);
      return {
        type: row.placed.length ? "PI_CON_EDF" : "SIN_EDF",
        customer: { ...row.customer, opportunityHl: row.avgHl },
        suggestedModel: model,
        currentEdfCount: row.placed.length,
        currentBusinesses: uniqueSorted(row.placed.map((edf) => edf.business || "OTROS")),
        projectedRepayment: Math.round((row.avgHl / target) * 100),
        projectedPeriods,
        priority: row.customer.pi ? "Alta" : row.avgHl >= 2.5 ? "Alta" : "Media"
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || b.projectedRepayment - a.projectedRepayment);
}

function customerOpportunityAverage(customer) {
  const businesses = ["CZA", "UNG", "AGUAS", "RB"];
  return Math.max(...businesses.map((business) => rolling12Hl(customer, business, currentYear, currentMonth)), 0);
}

function opportunityProjectionPeriods(customer, target) {
  const businesses = ["CZA", "UNG", "AGUAS", "RB"];
  const best = (fn) => Math.max(...businesses.map((business) => fn(customer, business)), 0);
  const row = (hl) => ({ hl: Number(hl.toFixed(2)), pct: target ? Math.round((hl / target) * 100) : 0 });
  const periods = {
    year: row(best((customer, business) => yearlyHl(customer, business, 2026))),
    rolling: row(best((customer, business) => rolling12Hl(customer, business, currentYear, currentMonth))),
    month: row(best((customer, business) => monthlyHl(customer, business, currentYear, currentMonth))),
    quarter: row(best((customer, business) => quarterAverageHl(customer, business, currentYear, currentMonth)))
  };
  for (let month = 1; month <= currentMonth; month += 1) {
    periods[`m${String(month).padStart(2, "0")}`] = row(best((customer, business) => monthlyHl(customer, business, currentYear, month)));
  }
  return periods;
}

function chooseModel(hl, models) {
  const opportunityModels = ["Vertical grande", "Slim"];
  const affordable = opportunityModels.filter((model) => hl / repaymentTargets[model] >= 0.75);
  return affordable[0] || "Slim";
}

function makeMail(db, movement) {
  const rows = movement.items.map((item) => {
    const edf = db.edfs.find((entry) => entry.id === item.edfId);
    const customer = item.customerId ? db.customers.find((entry) => entry.id === item.customerId) : null;
    return { activo: edf?.asset || "", serie: edf?.serial || "", modelo: edf?.model || "", cliente: customer?.name || "", localidad: customer?.city || edf?.deposit || "", destino: item.deposit || edf?.deposit || "" };
  });
  const cities = [...new Set(rows.map((row) => row.localidad).filter(Boolean))];
  const recipients = db.recipients.filter((entry) => cities.includes(entry.city)).map((entry) => entry.recipients).join("; ");
  return {
    subject: `[EDF] ${movement.type} - ${rows.length} equipo(s)`,
    recipients,
    body: `Se informa movimiento ${movement.type} consolidado para ${rows.length} equipo(s).`,
        rows,
        mailto: buildMailto(recipients, `[EDF] ${movement.type} - ${rows.length} equipo(s)`, rows)
  };
}

function buildMailto(recipients, subject, rows) {
  const lines = [
    "Se informa movimiento EDF consolidado.",
    "",
    "Activo | Serie | Modelo | Cliente | Localidad | Destino",
    ...rows.map((row) => `${row.activo} | ${row.serie} | ${row.modelo} | ${row.cliente} | ${row.localidad} | ${row.destino}`)
  ];
  return `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

async function handleApi(req, res, db) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, attachComputed(db));

  if (req.method === "POST" && url.pathname === "/api/import/run") {
    const result = await runImport();
    const raw = await fs.readFile(DB_PATH, "utf8");
    Object.assign(db, JSON.parse(raw));
    return json(res, 200, { result, state: attachComputed(db) });
  }

  if (req.method === "POST" && url.pathname === "/api/movements") {
    const input = await readBody(req);
    const movement = applyMovement(db, input);
    await saveDb(db);
    return json(res, 200, { movement, state: attachComputed(db) });
  }

  if (req.method === "POST" && url.pathname === "/api/pi") {
    const input = await readBody(req);
    const customer = db.customers.find((entry) => entry.id === input.customerId);
    if (!customer) return json(res, 404, { error: "Cliente no encontrado" });
    customer.pi = true;
    customer.potentialPi = false;
    const event = { id: crypto.randomUUID(), customerId: customer.id, user: input.user || "Operador EDF", action: "AGREGAR_PI", at: new Date().toISOString() };
    db.piEvents.unshift(event);
    db.audit.unshift({ id: crypto.randomUUID(), action: "AGREGAR_PI", user: event.user, at: event.at, customerId: customer.id, changes: { pi: true } });
    await saveDb(db);
    return json(res, 200, { event, state: attachComputed(db) });
  }

  if (req.method === "PUT" && url.pathname === "/api/recipients") {
    const input = await readBody(req);
    db.recipients = input.recipients || [];
    db.audit.unshift({ id: crypto.randomUUID(), action: "EDITAR_AGENDA_MAILS", user: input.user || "Operador EDF", at: new Date().toISOString(), changes: { total: db.recipients.length } });
    await saveDb(db);
    return json(res, 200, { state: attachComputed(db) });
  }

  if (req.method === "POST" && url.pathname === "/api/import/txt-sales") {
    const input = await readBody(req);
    const result = importSalesTxt(db, input.text || "");
    await saveDb(db);
    return json(res, 200, { result, state: attachComputed(db) });
  }

  return json(res, 404, { error: "API no encontrada" });
}

function runImport() {
  return new Promise((resolve, reject) => {
    const importEnv = { ...process.env };
    if (!importEnv.EDF_SOURCE_DIR && importEnv.GOOGLE_DRIVE_FOLDER_URL) {
      importEnv.EDF_SOURCE_DIR = path.join(__dirname, "data", "drive-source");
    }
    const steps = [];
    if (process.env.GOOGLE_DRIVE_FOLDER_URL) {
      steps.push(["sync", process.env.PYTHON || "python", ["scripts\\sync-google-drive.py"]]);
    }
    steps.push(["export", "powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", "scripts\\export-edf-sheets.ps1"]]);
    steps.push(["import", process.execPath, ["scripts\\import-edf-data.mjs"]]);

    const outputs = {};
    const runStep = (index) => {
      if (index >= steps.length) {
        try {
          return resolve({ ...JSON.parse(outputs.import || "{}"), sincronizacion: outputs.sync?.trim(), exportacion: outputs.export?.trim() });
        } catch {
          return resolve({ output: outputs.import?.trim(), sincronizacion: outputs.sync?.trim(), exportacion: outputs.export?.trim() });
        }
      }
      const [name, command, args] = steps[index];
      const child = spawn(command, args, { cwd: __dirname, shell: false, env: importEnv });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => stdout += chunk.toString());
      child.stderr.on("data", (chunk) => stderr += chunk.toString());
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(stderr || `${name} fallo con codigo ${code}`));
        outputs[name] = stdout;
        runStep(index + 1);
      });
    };
    runStep(0);
  });
}

function applyMovement(db, input) {
  const type = String(input.type || "").toUpperCase();
  const now = new Date().toISOString();
  const user = input.user || "Operador EDF";
  const items = Array.isArray(input.items) ? input.items : [];
  const movement = { id: crypto.randomUUID(), type, user, at: now, items: [], reason: input.reason || "" };

  for (const item of items) {
    const edf = db.edfs.find((entry) => entry.id === item.edfId);
    if (!edf) continue;
    const before = { status: edf.status, deposit: edf.deposit, customerId: edf.customerId };
    const nextStatus = normalizeStatus(item.status || statusForMovement(type));
    if (!validStatuses.has(nextStatus)) throw new Error(`Estado invalido: ${nextStatus}`);
    if (item.deposit && !validDeposits.has(item.deposit)) throw new Error(`Deposito invalido: ${item.deposit}`);

    edf.status = nextStatus;
    if (item.deposit) edf.deposit = item.deposit;
    if (type === "COMODATO") edf.customerId = item.customerId || edf.customerId;
    if (["CONTRA COMODATO", "VUELTA REPARACION", "BAJA DEFINITIVA"].includes(type)) edf.customerId = null;
    if (type === "REPARACION") edf.customerId = null;
    if (type === "ALTA STOCK") edf.customerId = null;

    const after = { status: edf.status, deposit: edf.deposit, customerId: edf.customerId };
    movement.items.push({ edfId: edf.id, customerId: item.customerId || null, deposit: item.deposit || edf.deposit, before, after });
  }

  movement.mail = makeMail(db, movement);
  db.movements.unshift(movement);
  db.audit.unshift({ id: crypto.randomUUID(), action: type, user, at: now, edfIds: movement.items.map((item) => item.edfId), changes: movement.items });
  return movement;
}

function statusForMovement(type) {
  const map = {
    "ALTA STOCK": "STOCK",
    COMODATO: "PDV",
    "CONTRA COMODATO": "STOCK",
    REPARACION: "REPARACION",
    "VUELTA REPARACION": "STOCK",
    "BAJA DEFINITIVA": "BAJA DEFINITIVA",
    TRANSFERENCIA: "STOCK",
    "AJUSTE INVENTARIO": "STOCK"
  };
  return map[type] || "STOCK";
}

function importSalesTxt(db, text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  let updated = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(/\t|;/);
    const customerId = cols[0]?.trim();
    const hl = Number(String(cols[40] || cols.at(-1) || "0").replace(",", "."));
    const customer = db.customers.find((entry) => entry.id === customerId);
    if (customer && Number.isFinite(hl)) {
      customer.annualHl = Number(((customer.annualHl || 0) + hl).toFixed(2));
      updated += 1;
    }
  }
  db.audit.unshift({ id: crypto.randomUUID(), action: "IMPORTAR_VENTAS_TXT", user: "Sistema", at: new Date().toISOString(), changes: { lines: lines.length, updated } });
  return { lines: lines.length, updated };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const fullPath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const db = await ensureDb();
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res, db);
    return await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`EDF dashboard running on http://localhost:${PORT}`);
});
