const { createElement: h, useEffect, useMemo, useState } = React;
const root = ReactDOM.createRoot(document.getElementById("root"));

const nav = [
  ["dashboard", "LayoutDashboard", "Dashboard"],
  ["edfs", "Search", "Buscar EDF"],
  ["movements", "ArrowLeftRight", "Movimientos"],
  ["repayment", "Gauge", "Repago"],
  ["tracking", "BarChart3", "Seguimiento"],
  ["commercial", "TrendingUp", "Comercial"],
  ["audit", "History", "Auditoría"],
  ["mails", "Mail", "Mails"]
];

const movementTypes = ["COMODATO", "CONTRA COMODATO", "BAJA DEFINITIVA", "REPARACION", "VUELTA REPARACION", "TRANSFERENCIA", "ALTA STOCK", "AJUSTE INVENTARIO"];
const deposits = ["INTERIOR", "MADRYN", "TRELEW"];

function Icon({ name, size = 18 }) {
  return h("i", { "data-lucide": name, style: { width: size, height: size } });
}

function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  async function load() {
    const res = await fetch("/api/state");
    setState(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    lucide.createIcons();
  });

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    return state.edfs.filter((edf) => {
      if (!q) return true;
      if (searchType === "asset") return String(edf.asset || "").toLowerCase().includes(q);
      if (searchType === "serial") return String(edf.serial || "").toLowerCase().includes(q);
      if (searchType === "customer") return String(edf.customerId || edf.customer?.id || "").toLowerCase().includes(q);
      return [edf.asset, edf.serial, edf.customerId, edf.model, edf.customer?.name, edf.customer?.city, edf.customer?.seller].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [state, query, searchType]);

  function toggleEdf(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submitMovement(payload) {
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setState(data.state);
    setModal({ type: "mail", mail: data.movement.mail });
    setSelected([]);
  }

  async function addPi(customerId) {
    const res = await fetch("/api/pi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, user: "Operador EDF" })
    });
    const data = await res.json();
    setState(data.state);
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/import/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo importar");
      setState(data.state);
      setModal({ type: "import", result: data.result });
    } catch (error) {
      setModal({ type: "import", error: error.message });
    } finally {
      setImporting(false);
    }
  }

  if (loading) return h("div", { className: "p-8" }, "Cargando sistema EDF...");

  return h("div", { className: "app-shell" },
    h(Sidebar, { view, setView }),
    h("main", { className: "content" },
      h(Header, { state, query, setQuery, searchType, setSearchType, runImport, importing }),
      h(QuickActions, { selected, setModal }),
      view === "dashboard" && h(Dashboard, { state }),
      view === "edfs" && h(EdfTable, { edfs: filtered, selected, toggleEdf, setModal }),
      view === "movements" && h(Movements, { state, selected, setSelected, setModal }),
      view === "repayment" && h(Repayment, { state }),
      view === "tracking" && h(Tracking, { state }),
      view === "commercial" && h(Commercial, { state, addPi }),
      view === "alerts" && h(Alerts, { state }),
      view === "audit" && h(Audit, { state }),
      view === "mails" && h(Mails, { state, setState }),
      h("footer", { className: "footer" }, "by QπU")
    ),
    modal?.type === "movement" && h(MovementModal, { state, selected, close: () => setModal(null), submitMovement, defaultType: modal.defaultType }),
    modal?.type === "mail" && h(MailModal, { mail: modal.mail, close: () => setModal(null) }),
    modal?.type === "import" && h(ImportModal, { result: modal.result, error: modal.error, close: () => setModal(null) }),
    modal?.type === "history" && h(HistoryModal, { state, edfId: modal.edfId, close: () => setModal(null) })
  );
}

function Sidebar({ view, setView }) {
  return h("aside", { className: "sidebar" },
    h("div", { className: "flex items-center gap-3 mb-7" },
      h("div", { className: "brand-mark" }, "EDF"),
      h("div", null, h("div", { className: "font-black text-lg" }, "Control Activos"), h("div", { className: "text-xs text-emerald-100" }, "Stock · Repago · PI"))
    ),
    h("div", { className: "space-y-1" }, nav.map(([id, icon, label]) =>
      h("button", { key: id, className: `nav-button ${view === id ? "active" : ""}`, onClick: () => setView(id), title: label },
        h(Icon, { name: icon }), h("span", null, label)
      )
    ))
  );
}

function Header({ state, query, setQuery, searchType, setSearchType, runImport, importing }) {
  return h("section", { className: "toolbar" },
    h("div", null,
      h("h1", { className: "text-2xl font-black" }, "EDF Control Operativo"),
      h("p", { className: "text-sm text-stone-500" }, "Stock automático, comodatos, repago, mix, PI y auditoría compartida")
    ),
    h("div", { className: "flex gap-2 items-center" },
      h("select", { className: "input", value: searchType, onChange: (e) => setSearchType(e.target.value) },
        h("option", { value: "all" }, "Todo"),
        h("option", { value: "asset" }, "Activo"),
        h("option", { value: "serial" }, "Serie"),
        h("option", { value: "customer" }, "Código cliente")
      ),
      h("input", { className: "input w-72", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Buscar activo, serie, cliente..." }),
      h("button", { className: "btn primary", disabled: importing, onClick: runImport, title: "Importar archivos de REPAGO EDF" }, h(Icon, { name: importing ? "LoaderCircle" : "RefreshCw" }), importing ? "Importando..." : "Importar"),
      h("button", { className: "btn icon", title: "Exportar Excel CSV", onClick: () => exportCsv(state) }, h(Icon, { name: "FileSpreadsheet" })),
      h("button", { className: "btn icon", title: "Exportar PDF", onClick: () => window.print() }, h(Icon, { name: "FileText" })),
      h("span", { className: "badge teal" }, `${state.metrics.totalEdf} EDF`)
    )
  );
}

function ImportModal({ result, error, close }) {
  return h("div", { className: "modal-backdrop" },
    h("div", { className: "modal-card" },
      h("div", { className: "flex justify-between items-center mb-4" },
        h("h2", { className: "text-xl font-black" }, error ? "Importación fallida" : "Importación completada"),
        h("button", { className: "btn icon", onClick: close }, h(Icon, { name: "X" }))
      ),
      error
        ? h("p", { className: "text-red-700 font-bold" }, error)
        : h("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-2" }, Object.entries(result || {}).map(([key, value]) =>
            h("div", { className: "metric-card" }, h("span", { className: "badge gray" }, key), h("b", { className: "text-xl break-words" }, Array.isArray(value) ? value.join(", ") : String(value)))
          ))
    )
  );
}

function exportCsv(state) {
  const headers = ["Activo", "Serie", "Estado", "Deposito", "Cliente", "Localidad", "Vendedor", "Modelo", "HL", "Objetivo", "Repago"];
  const rows = state.edfs.map((edf) => [edf.asset, edf.serial, edf.statusLabel, edf.deposit, edf.customer?.name || "", edf.customer?.city || "", edf.customer?.seller || "", edf.model, edf.repayment.hl, edf.repayment.target, `${edf.repayment.pct}%`]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reporte-edf.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportRepaymentCsv(edfs, periodData, periodLabel) {
  const headers = ["Cliente", "Codigo cliente", "Negocio", "Supervisor", "Promotor", "Ruta", "EDF", "Serie", "Modelo", "Periodo", "HL", "Objetivo", "Minimo", "% repago", "Estado"];
  const rows = edfs.map((edf) => {
    const repayment = periodData(edf);
    return [
      edf.customer?.name || "",
      edf.customer?.id || edf.customerId || "",
      edf.business || "OTROS",
      edf.customer?.supervisor || "Sin supervisor",
      edf.customer?.promoter || edf.customer?.seller || "Sin promotor",
      edf.customer?.route || "",
      edf.asset || "",
      edf.serial || "",
      edf.model || "",
      periodLabel,
      repayment.hl,
      edf.repayment.target,
      edf.repayment.minimum,
      `${repayment.pct}%`,
      repayment.band?.label || ""
    ];
  });
  downloadCsv(`repago-edf-${String(periodLabel).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`, [headers, ...rows]);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function QuickActions({ selected, setModal }) {
  return h("section", { className: "panel mb-4" },
    h("div", { className: "flex items-center justify-between gap-3 mb-3" },
      h("div", null, h("h2", { className: "font-black" }, "Acciones rápidas"), h("p", { className: "text-sm text-stone-500" }, `${selected.length} EDF seleccionados`)),
      h("button", { className: "btn primary", onClick: () => setModal({ type: "movement", defaultType: "COMODATO" }) }, h(Icon, { name: "Send" }), "Generar movimiento")
    ),
    h("div", { className: "quick-grid" }, [
      ["COMODATO", "PackageCheck", "Comodatear"],
      ["CONTRA COMODATO", "Undo2", "Contra comodatear"],
      ["BAJA DEFINITIVA", "ArchiveX", "Dar de baja"],
      ["REPARACION", "Wrench", "Reparación"],
      ["TRANSFERENCIA", "Truck", "Transferir"],
      ["AJUSTE INVENTARIO", "ClipboardCheck", "Ajuste inventario"]
    ].map(([type, icon, label]) => h("button", { className: "btn", onClick: () => setModal({ type: "movement", defaultType: type }) }, h(Icon, { name: icon }), label)))
  );
}

function Dashboard({ state }) {
  const metrics = [
    ["Total EDF", state.metrics.totalEdf, "Package", "teal"],
    ["Disponibles", state.metrics.inStock, "Warehouse", "green"],
    ["En PDV", state.metrics.placed, "Store", "violet"],
    ["Bajo 75%", state.metrics.belowRepayment, "Gauge", "orange"],
    ["Sin venta", state.metrics.noSales, "CircleSlash", "red"],
    ["Reparación", state.metrics.repair, "Wrench", "yellow"],
    ["Bajas", state.metrics.baja, "ArchiveX", "gray"],
    ["Clientes PI", state.metrics.piCustomers, "Star", "lime"],
    ["% Repago", `${state.metrics.repaymentCompliance?.pct || 0}%`, "BadgeCheck", "green"]
  ];
  return h("div", { className: "space-y-4" },
    h("section", { className: "metric-grid" }, metrics.map(([label, value, icon, color]) => h(Metric, { label, value, icon, color }))),
    h(BusinessMetrics, { rows: state.metrics.byBusiness || [] }),
    h("section", { className: "grid grid-cols-1 xl:grid-cols-3 gap-4" },
      h("div", { className: "panel xl:col-span-3" }, h("h2", { className: "font-black mb-3" }, "Stock por depósito"), h(StockBars, { stock: state.stock }))
    ),
    h("section", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4" },
      h(RankingPanel, { title: "Peores clientes por repago", rows: state.rankings.worstCustomers }),
      h(RankingPanel, { title: "Mejores clientes por repago", rows: state.rankings.bestCustomers })
    )
  );
}

function Metric({ label, value, icon, color }) {
  return h("article", { className: "metric-card" },
    h("div", { className: "flex items-center justify-between" }, h("span", { className: `badge ${color}` }, label), h(Icon, { name: icon })),
    h("div", { className: "text-4xl font-black" }, value)
  );
}

function BusinessMetrics({ rows }) {
  if (!rows.length) return null;
  return h("section", { className: "panel" },
    h("div", { className: "flex items-center justify-between gap-3 mb-3" },
      h("h2", { className: "font-black" }, "Cantidad de EDF por negocio"),
      h("span", { className: "badge teal" }, "CZA / UNG / AGUAS / RB")
    ),
    h("div", { className: "table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null, ["Negocio", "Total", "En PDV", "Disponibles", "Bajo 75%", "Venta 0", "Repagan 75%+", "% Repago"].map((x) => h("th", null, x)))),
        h("tbody", null, rows.map((row) => h("tr", { key: row.business },
          h("td", null, h("span", { className: "badge violet" }, row.business)),
          h("td", { className: "font-bold" }, row.total),
          h("td", null, row.placed),
          h("td", null, row.available),
          h("td", null, row.belowRepayment),
          h("td", null, row.noSales),
          h("td", null, row.compliant),
          h("td", null, h("span", { className: `badge ${row.compliancePct >= 75 ? "green" : row.compliancePct >= 50 ? "yellow" : "red"}` }, `${row.compliancePct}%`))
        )))
      )
    )
  );
}

function StockBars({ stock }) {
  return h("div", { className: "space-y-3" }, Object.entries(stock).map(([deposit, row]) =>
    h("div", { key: deposit },
      h("div", { className: "flex justify-between text-sm mb-1" }, h("b", null, deposit), h("span", null, `${row.available} disponibles`)),
      h("div", { className: "bar" }, h("span", { style: { width: `${Math.min(100, row.available * 20)}%` } })),
      h("div", { className: "flex gap-2 mt-2 flex-wrap" },
        h("span", { className: "badge green" }, `Stock ${row.STOCK}`),
        h("span", { className: "badge teal" }, `Depósito ${row.DEPOSITO}`),
        h("span", { className: "badge yellow" }, `Rep ${row.REPARACION}`),
        row["BAJA DEFINITIVA"] ? h("span", { className: "badge gray" }, `Baja ${row["BAJA DEFINITIVA"]}`) : null
      )
    )
  ));
}

function EdfTable({ edfs, selected, toggleEdf, setModal }) {
  return h("section", { className: "table-wrap" },
    h("table", null,
      h("thead", null, h("tr", null, ["", "Activo", "Serie", "Negocio", "Estado", "Depósito", "Cliente", "Localidad", "Vendedor", "Modelo", "HL prom. 2026", "Repago", "Acciones"].map((x) => h("th", null, x)))),
      h("tbody", null, edfs.map((edf) => h("tr", { key: edf.id },
        h("td", null, h("input", { type: "checkbox", checked: selected.includes(edf.id), onChange: () => toggleEdf(edf.id) })),
        h("td", { className: "font-bold" }, edf.asset || "Sin activo"),
        h("td", null, edf.serial || "Sin serie"),
        h("td", null, h("span", { className: "badge violet" }, edf.business || "OTROS")),
        h("td", null, h(StatusBadge, { status: edf.statusLabel })),
        h("td", null, edf.deposit),
        h("td", null, edf.customer?.name || "-"),
        h("td", null, edf.customer?.city || "-"),
        h("td", null, edf.customer?.seller || "-"),
        h("td", null, edf.model),
        h("td", null, edf.repayment.periods?.year?.hl ?? edf.repayment.hl),
        h("td", null, h("span", { className: `badge ${edf.repayment.band.color}` }, `${edf.repayment.pct}%`)),
        h("td", null, h("button", { className: "btn icon", title: "Historial", onClick: () => setModal({ type: "history", edfId: edf.id }) }, h(Icon, { name: "History" })))
      )))
    )
  );
}

function StatusBadge({ status }) {
  const color = status === "PDV" ? "violet" : status === "STOCK" ? "green" : status === "DEPÓSITO" ? "teal" : status === "REPARACIÓN" ? "yellow" : "gray";
  return h("span", { className: `badge ${color}` }, status);
}

function Movements({ state, selected, setSelected, setModal }) {
  return h("section", { className: "space-y-4" },
    h("div", { className: "panel flex items-center justify-between gap-3" },
      h("div", null, h("h2", { className: "font-black" }, "Movimientos EDF"), h("p", { className: "text-sm text-stone-500" }, "El stock se recalcula desde estado actual y último movimiento")),
      h("button", { className: "btn primary", onClick: () => setModal({ type: "movement", defaultType: "COMODATO" }) }, h(Icon, { name: "Plus" }), "Nuevo movimiento")
    ),
    h(EdfTable, { edfs: state.edfs, selected, toggleEdf: (id) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]), setModal }),
    h("div", { className: "table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null, ["Fecha", "Acción", "Usuario", "EDF", "Mail"].map((x) => h("th", null, x)))),
        h("tbody", null, state.movements.map((m) => h("tr", { key: m.id },
          h("td", null, new Date(m.at).toLocaleString()),
          h("td", null, h("span", { className: "badge teal" }, m.type)),
          h("td", null, m.user),
          h("td", null, m.items.length),
          h("td", null, m.mail?.subject || "-")
        )))
      )
    )
  );
}

function Repayment({ state }) {
  const [band, setBand] = useState("todos");
  const [supervisor, setSupervisor] = useState("todos");
  const [promoter, setPromoter] = useState("todos");
  const [business, setBusiness] = useState("todos");
  const [period, setPeriod] = useState("year");
  const [clientQuery, setClientQuery] = useState("");
  const periodLabels = { year: "Año 2026", rolling: "Anual móvil", month: "Mes corriente", quarter: "Trimestre promedio" };
  const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const periodOptions = [...Object.entries(periodLabels), ...(state.metrics.tracking?.months || []).map((row) => [`m${String(row.month).padStart(2, "0")}`, monthLabels[row.month - 1] || row.label])];
  const bands = [
    ["todos", "Todos", "gray"],
    ["venta0", "Venta 0", "gray"],
    ["0-25", "0%-25%", "red"],
    ["25-50", "25%-50%", "orange"],
    ["50-75", "50%-75%", "yellow"],
    ["75+", "75%-+100%", "green"]
  ];
  const placed = state.edfs.filter((e) => e.status === "PDV");
  const periodData = (edf) => edf.repayment.periods?.[period] || edf.repayment;
  const cq = clientQuery.trim().toLowerCase();
  const clientMatches = (edf) => !cq || [edf.customer?.id, edf.customerId, edf.customer?.name, edf.customer?.route, edf.customer?.promoter, edf.customer?.seller].some((value) => String(value || "").toLowerCase().includes(cq));
  const baseFiltered = placed.filter((edf) =>
    clientMatches(edf) &&
    (supervisor === "todos" || (edf.customer?.supervisor || "Sin supervisor") === supervisor) &&
    (promoter === "todos" || (edf.customer?.promoter || edf.customer?.seller || "Sin promotor") === promoter) &&
    (business === "todos" || (edf.business || "OTROS") === business)
  );
  const filtered = placed.filter((edf) =>
    clientMatches(edf) &&
    (band === "todos" || periodData(edf).band.key === band) &&
    (supervisor === "todos" || (edf.customer?.supervisor || "Sin supervisor") === supervisor) &&
    (promoter === "todos" || (edf.customer?.promoter || edf.customer?.seller || "Sin promotor") === promoter) &&
    (business === "todos" || (edf.business || "OTROS") === business)
  );
  const compliant = filtered.filter((edf) => periodData(edf).pct >= 75).length;
  const compliancePct = filtered.length ? Math.round((compliant / filtered.length) * 100) : 0;
  const criticalCustomers = topCriticalCustomers(baseFiltered, periodData);
  return h("section", { className: "space-y-4" },
    h("div", { className: "grid grid-cols-2 lg:grid-cols-6 gap-2" }, bands.slice(1).map(([key, label, color]) => {
      const count = baseFiltered.filter((e) => periodData(e).band.key === key).length;
      return h("button", { className: "metric-card text-left", onClick: () => setBand(key) }, h("span", { className: `badge ${color}` }, label), h("b", { className: "text-3xl" }, count));
    })),
    h("div", { className: "panel" },
      h("div", { className: "grid grid-cols-1 md:grid-cols-8 gap-2" },
        h("select", { className: "input", value: period, onChange: (e) => setPeriod(e.target.value) }, periodOptions.map(([key, label]) => h("option", { value: key }, label))),
        h("input", { className: "input", value: clientQuery, onChange: (e) => setClientQuery(e.target.value), placeholder: "Buscar cliente o codigo..." }),
        h("select", { className: "input", value: band, onChange: (e) => setBand(e.target.value) }, bands.map(([key, label]) => h("option", { value: key }, label))),
        h("select", { className: "input", value: business, onChange: (e) => setBusiness(e.target.value) }, h("option", { value: "todos" }, "Todos los negocios"), (state.filters?.businesses || []).map((name) => h("option", { value: name }, name))),
        h("select", { className: "input", value: supervisor, onChange: (e) => setSupervisor(e.target.value) }, h("option", { value: "todos" }, "Todos los supervisores"), (state.filters?.supervisors || []).map((name) => h("option", { value: name }, name))),
        h("select", { className: "input", value: promoter, onChange: (e) => setPromoter(e.target.value) }, h("option", { value: "todos" }, "Todos los promotores"), (state.filters?.promoters || []).map((name) => h("option", { value: name }, name))),
        h("button", { className: "btn", onClick: () => exportRepaymentCsv(filtered, periodData, periodOptions.find(([key]) => key === period)?.[1] || period) }, h(Icon, { name: "FileSpreadsheet" }), "Exportar Excel"),
        h("div", { className: "badge teal justify-center h-10" }, `${compliancePct}% repagan`)
      )
    ),
    h(CriticalCustomersTable, { rows: criticalCustomers }),
    h("div", { className: "table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null, ["Código", "Cliente", "Negocio", "Supervisor", "Promotor", "EDF", "Modelo", "HL", "Objetivo", "Mínimo", "% repago", "Estado"].map((x) => h("th", null, x)))),
        h("tbody", null, filtered.map((edf) => h("tr", null,
          h("td", { className: "font-bold" }, edf.customer?.id || edf.customerId || "-"),
          h("td", null, edf.customer?.name || "-"),
          h("td", null, h("span", { className: "badge violet" }, edf.business || "OTROS")),
          h("td", null, edf.customer?.supervisor || "Sin supervisor"),
          h("td", null, edf.customer?.promoter || edf.customer?.seller || "Sin promotor"),
          h("td", null, edf.asset),
          h("td", null, edf.model),
          h("td", null, periodData(edf).hl),
          h("td", null, edf.repayment.target),
          h("td", null, edf.repayment.minimum),
          h("td", null, `${periodData(edf).pct}%`),
          h("td", null, h("span", { className: `badge ${periodData(edf).band.color}` }, periodData(edf).band.label))
        )))
      )
    )
  );
}

function topCriticalCustomers(edfs, periodData) {
  const rows = new Map();
  for (const edf of edfs) {
    if (!edf.customer) continue;
    const repayment = periodData(edf);
    const business = edf.business || "OTROS";
    const key = `${edf.customer.id}::${business}`;
    if (!rows.has(key)) {
      rows.set(key, {
        id: key,
        customerId: edf.customer.id,
        name: edf.customer.name || "-",
        business,
        supervisor: edf.customer.supervisor || "Sin supervisor",
        promoter: edf.customer.promoter || edf.customer.seller || "Sin promotor",
        totalEdf: 0,
        lowEdf: 0,
        zeroSales: 0,
        pctTotal: 0
      });
    }
    const row = rows.get(key);
    row.totalEdf += 1;
    row.pctTotal += repayment.pct || 0;
    if ((repayment.pct || 0) < 75) row.lowEdf += 1;
    if (repayment.band?.key === "venta0") row.zeroSales += 1;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, avgPct: row.totalEdf ? Math.round(row.pctTotal / row.totalEdf) : 0 }))
    .filter((row) => row.lowEdf > 0)
    .sort((a, b) => b.lowEdf - a.lowEdf || a.avgPct - b.avgPct || b.totalEdf - a.totalEdf || a.name.localeCompare(b.name))
    .slice(0, 10);
}

function CriticalCustomersTable({ rows }) {
  return h("div", { className: "panel" },
    h("div", { className: "flex items-center justify-between gap-3 mb-3" },
      h("h2", { className: "font-black" }, "Top 10 clientes con menor repago"),
      h("span", { className: "badge orange" }, "Por negocio")
    ),
    h("div", { className: "table-wrap" },
      h("table", { className: "min-w-full" },
        h("thead", null, h("tr", null, ["Negocio", "Código", "Nombre fantasía", "Supervisor", "Promotor", "EDF bajo 75", "Venta 0", "EDF total", "% prom."].map((x) => h("th", null, x)))),
        h("tbody", null, rows.length ? rows.map((row) => h("tr", null,
          h("td", null, h("span", { className: "badge violet" }, row.business)),
          h("td", { className: "font-bold" }, row.customerId),
          h("td", { className: "font-bold" }, row.name),
          h("td", null, row.supervisor),
          h("td", null, row.promoter),
          h("td", null, h("span", { className: "badge orange" }, row.lowEdf)),
          h("td", null, row.zeroSales),
          h("td", null, row.totalEdf),
          h("td", null, h("span", { className: `badge ${row.avgPct >= 75 ? "green" : row.avgPct >= 50 ? "yellow" : "red"}` }, `${row.avgPct}%`))
        )) : h("tr", null, h("td", { colSpan: 9 }, "No hay clientes con EDF bajo 75% para estos filtros.")))
      )
    )
  );
}

function Tracking({ state }) {
  const tracking = state.metrics.tracking || { months: [], byBusiness: [] };
  return h("section", { className: "space-y-4" },
    h("div", { className: "panel flex flex-col lg:flex-row lg:items-center justify-between gap-3" },
      h("div", null,
        h("h2", { className: "font-black" }, `Seguimiento mensual ${tracking.year || ""}`),
        h("p", { className: "text-sm text-stone-500" }, "Porcentaje de EDF vigentes que repagan 75% o más en cada mes")
      ),
      h("span", { className: "badge teal" }, "No cuenta reparación")
    ),
    h(RepaymentBars, { title: "Repago mensual total", rows: tracking.months || [], color: "teal" }),
    h("section", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4" },
      (tracking.byBusiness || []).map((serie) => h(RepaymentBars, { key: serie.business, title: `Repago mensual ${serie.business}`, rows: serie.months, color: businessColor(serie.business) }))
    )
  );
}

function businessColor(business) {
  return { CZA: "green", UNG: "violet", AGUAS: "teal", RB: "orange" }[business] || "gray";
}

function RepaymentBars({ title, rows, color }) {
  const maxPct = 100;
  return h("div", { className: "panel" },
    h("div", { className: "flex items-center justify-between gap-3 mb-3" },
      h("h2", { className: "font-black" }, title),
      rows.length ? h("span", { className: `badge ${color}` }, `${rows.at(-1).pct}% actual`) : null
    ),
    h("div", { className: "bar-chart" },
      rows.map((row) => h("div", { className: "bar-month", key: row.key },
        h("div", { className: "bar-plot" },
          h("div", { className: `bar-fill ${color}`, style: { height: `${Math.max(2, Math.min(100, Math.round(((row.pct || 0) / maxPct) * 100)))}%` } },
            h("span", null, `${row.pct}%`)
          )
        ),
        h("div", { className: "bar-label" }, row.label),
        h("div", { className: "bar-sub" }, `${row.compliant}/${row.active} EDF 75%+`),
        h("div", { className: "bar-hl" }, `${row.hl} HL`)
      ))
    )
  );
}

function Commercial({ state, addPi }) {
  const [tab, setTab] = useState("opportunities");
  const [supervisor, setSupervisor] = useState("todos");
  const [mixRepays, setMixRepays] = useState("todos");
  const [mixPriority, setMixPriority] = useState("todos");
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [opportunityType, setOpportunityType] = useState("todos");
  const [opportunityPiFilter, setOpportunityPiFilter] = useState("todos");
  const [customerRepaysFilter, setCustomerRepaysFilter] = useState("todos");
  const [commercialPeriod, setCommercialPeriod] = useState("year");
  const commercialMonthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const commercialPeriodLabels = { year: "Año 2026", rolling: "Anual móvil", month: "Mes corriente", quarter: "Trimestre promedio" };
  const commercialPeriodOptions = [...Object.entries(commercialPeriodLabels), ...(state.metrics.tracking?.months || []).map((row) => [`m${String(row.month).padStart(2, "0")}`, commercialMonthLabels[row.month - 1] || row.label])];
  const commercialRepayment = (edf) => edf.repayment.periods?.[commercialPeriod] || edf.repayment;
  const trackingMonths = state.metrics.tracking?.months || [];
  const allSalesKeys = (customer) => [...new Set(Object.values(customer?.monthlySalesByBusiness || {}).flatMap((row) => Object.keys(row || {})))].sort();
  const monthKeyFor = (period) => {
    if (!period.startsWith("m")) return null;
    const month = Number(period.slice(1));
    return trackingMonths.find((row) => row.month === month)?.key || allSalesKeys(state.customers[0]).find((key) => key.endsWith(`-${String(month).padStart(2, "0")}`));
  };
  const customerPeriodHl = (customer, business, period) => {
    const sales = customer?.monthlySalesByBusiness?.[business] || {};
    const keys = Object.keys(sales).sort();
    if (period.startsWith("m")) return Number((sales[monthKeyFor(period)] || 0).toFixed(2));
    const currentKeys = trackingMonths.map((row) => row.key).filter(Boolean);
    if (period === "month") return Number((sales[currentKeys.at(-1)] || 0).toFixed(2));
    if (period === "quarter") {
      const keysToUse = currentKeys.slice(-3);
      return Number((keysToUse.reduce((sum, key) => sum + (sales[key] || 0), 0) / Math.max(keysToUse.length, 1)).toFixed(2));
    }
    if (period === "rolling") {
      const keysToUse = keys.slice(-12);
      return Number((keysToUse.reduce((sum, key) => sum + (sales[key] || 0), 0) / Math.max(keysToUse.length || 12, 12)).toFixed(2));
    }
    return Number((currentKeys.reduce((sum, key) => sum + (sales[key] || 0), 0) / Math.max(currentKeys.length, 1)).toFixed(2));
  };
  const customerBestPeriodHl = (customer) => Math.max(...["CZA", "UNG", "AGUAS", "RB"].map((business) => customerPeriodHl(customer, business, commercialPeriod)), 0);
  const placedForCustomer = (customerId) => state.edfs
    .filter((edf) => edf.status === "PDV" && edf.customerId === customerId)
    .sort((a, b) => String(a.asset || a.serial || "").localeCompare(String(b.asset || b.serial || "")));
  const opportunityRepayment = (item) => {
    const placed = placedForCustomer(item.customer.id);
    if (!placed.length) {
      const targets = { "Vertical grande": 2.5, "Mostrador": 1.6, "Slim": 1.2, "Sahara": 1.2, "Doble puerta": 3.2, "Horizontal": 1.9, "3 bandejas": 1.6, "Baby visu": 1.6, "Vertical mediana": 1.9, "Check out": 1.6, "Full glass": 2.5, "Gondola de calidad": 3.2, "GÃ³ndola de calidad": 3.2 };
      const target = item.suggestedModel && item.suggestedModel.toUpperCase().includes("RED BULL") ? 0.001 : (targets[item.suggestedModel] || 1.6);
      const projected = item.projectedPeriods?.[commercialPeriod];
      const hl = projected?.hl ?? customerBestPeriodHl(item.customer);
      return { kind: "projected", pct: projected?.pct ?? (target ? Math.round((hl / target) * 100) : 0), hl, total: 0, compliant: 0 };
    }
    let compliant = 0;
    let hl = 0;
    for (const business of [...new Set(placed.map((edf) => edf.business || "OTROS"))]) {
      const group = placed.filter((edf) => (edf.business || "OTROS") === business);
      let remaining = customerPeriodHl(item.customer, business, commercialPeriod);
      hl += remaining;
      for (const edf of group) {
        const target = edf.repayment?.target || 1.6;
        const allocated = Math.max(0, Math.min(remaining, target));
        if (target && allocated / target >= 0.75) compliant += 1;
        remaining = Number((remaining - allocated).toFixed(2));
      }
    }
    return { kind: "actual", pct: placed.length ? Math.round((compliant / placed.length) * 100) : 0, hl: Number(hl.toFixed(2)), total: placed.length, compliant };
  };
  const opportunityPctText = (repayment) => repayment.pct > 100 ? "100%+" : `${repayment.pct}%`;
  const customerRepaymentFit = (customer) => {
    const hl = customerBestPeriodHl(customer);
    const verticalPct = Math.round((hl / 2.5) * 100);
    const slimPct = Math.round((hl / 1.2) * 100);
    if (verticalPct >= 75) return { hl, model: "Vertical grande", status: "Repagaría", pct: verticalPct, color: "green" };
    if (slimPct >= 75) return { hl, model: "Slim", status: "Repagaría", pct: slimPct, color: "lime" };
    return { hl, model: "Slim", status: "No repagaría", pct: slimPct, color: "red" };
  };
  const supervisorMatches = (customer) => supervisor === "todos" || (customer?.supervisor || "Sin supervisor") === supervisor;
  const opportunityPiMatches = (customer) => {
    if (opportunityPiFilter === "todos") return true;
    if (opportunityPiFilter === "agregar") return !customer?.pi;
    return (customer?.piTypes || []).includes(opportunityPiFilter);
  };
  const oq = opportunityQuery.trim().toLowerCase();
  const opportunities = state.opportunities.filter((item) =>
    (opportunityType === "todos" || item.type === opportunityType) &&
    opportunityPiMatches(item.customer) &&
    supervisorMatches(item.customer) &&
    (!oq || [item.customer.id, item.customer.name, item.customer.route, item.customer.promoter].some((value) => String(value || "").toLowerCase().includes(oq)))
  );
  const mixRows = state.edfs.filter((edf) =>
    edf.customer &&
    supervisorMatches(edf.customer) &&
    (mixRepays === "todos" || String(commercialRepayment(edf).pct >= 75) === mixRepays) &&
    (mixPriority === "todos" || edf.mix?.priority === mixPriority)
  );
  const allCustomerRows = state.customers
    .filter((customer) =>
      supervisorMatches(customer) &&
      (!oq || [customer.id, customer.name, customer.route, customer.promoter, customer.seller].some((value) => String(value || "").toLowerCase().includes(oq)))
    )
    .map((customer) => {
      const fit = customerRepaymentFit(customer);
      const placed = placedForCustomer(customer.id);
      return { customer, fit, placed };
    })
    .filter((row) =>
      customerRepaysFilter === "todos" ||
      (customerRepaysFilter === "repaga" && row.fit.status === "Repagaría") ||
      (customerRepaysFilter === "no" && row.fit.status !== "Repagaría")
    )
    .sort((a, b) => b.fit.hl - a.fit.hl);
  return h("section", { className: "space-y-4" },
    h("div", { className: "panel" },
      h("div", { className: "flex flex-col lg:flex-row lg:items-center justify-between gap-3" },
        h("div", { className: "flex gap-2" },
          h("button", { className: `btn ${tab === "opportunities" ? "primary" : ""}`, onClick: () => setTab("opportunities") }, h(Icon, { name: "Target" }), "Oportunidades"),
          h("button", { className: `btn ${tab === "mix" ? "primary" : ""}`, onClick: () => setTab("mix") }, h(Icon, { name: "Layers3" }), "Mix clientes"),
          h("button", { className: `btn ${tab === "customers" ? "primary" : ""}`, onClick: () => setTab("customers") }, h(Icon, { name: "Users" }), "Todos clientes")
        ),
        h("select", { className: "input", value: supervisor, onChange: (e) => setSupervisor(e.target.value) },
          h("option", { value: "todos" }, "Todos los supervisores"),
          (state.filters?.supervisors || []).map((name) => h("option", { value: name }, name))
        ),
        h("select", { className: "input", value: commercialPeriod, onChange: (e) => setCommercialPeriod(e.target.value) },
          commercialPeriodOptions.map(([key, label]) => h("option", { value: key }, label))
        )
      )
    ),
    tab === "mix" && h("div", { className: "panel" },
      h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2" },
        h("select", { className: "input", value: mixRepays, onChange: (e) => setMixRepays(e.target.value) },
          h("option", { value: "todos" }, "Repaga y no repaga"),
          h("option", { value: "true" }, "Solo repaga"),
          h("option", { value: "false" }, "Solo no repaga")
        ),
        h("select", { className: "input", value: mixPriority, onChange: (e) => setMixPriority(e.target.value) },
          h("option", { value: "todos" }, "Todas las prioridades"),
          h("option", { value: "Alta" }, "Prioridad alta"),
          h("option", { value: "Media" }, "Prioridad media"),
          h("option", { value: "Baja" }, "Prioridad baja")
        ),
        h("div", { className: "badge teal justify-center h-10" }, `${mixRows.length} EDF`)
      )
    ),
    tab === "opportunities" && h("div", { className: "panel" },
      h("div", { className: "flex items-center justify-between mb-3" }, h("h2", { className: "font-black" }, "Oportunidades comerciales"), h("span", { className: "badge teal" }, `${opportunities.length} clientes`)),
      h("div", { className: "text-sm text-stone-500 mb-3" }, `Periodo de referencia: ${commercialPeriodOptions.find(([key]) => key === commercialPeriod)?.[1] || "Año 2026"}`),
      h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2 mb-3" },
        h("select", { className: "input", value: opportunityType, onChange: (e) => setOpportunityType(e.target.value) },
          h("option", { value: "todos" }, "Sin EDF y PI con EDF"),
          h("option", { value: "SIN_EDF" }, "Solo clientes sin EDF"),
          h("option", { value: "PI_CON_EDF" }, "Solo PI con EDF")
        ),
        h("select", { className: "input", value: opportunityPiFilter, onChange: (e) => setOpportunityPiFilter(e.target.value) },
          h("option", { value: "todos" }, "Todos PI / no PI"),
          h("option", { value: "agregar" }, "Agregar a PI"),
          h("option", { value: "CZA" }, "PI CZA"),
          h("option", { value: "UNG" }, "PI UNG"),
          h("option", { value: "RB" }, "PI RB")
        ),
        h("input", { className: "input", value: opportunityQuery, onChange: (e) => setOpportunityQuery(e.target.value), placeholder: "Buscar cliente, codigo, ruta o promotor..." })
      ),
      opportunities.map((item) => {
      const oppRepayment = opportunityRepayment(item);
      return h("div", { className: "border-b py-3", key: `${item.type}_${item.customer.id}` },
        h("div", { className: "flex items-center justify-between gap-3" },
          h("b", null, item.customer.name),
          h("div", { className: "flex gap-2 flex-wrap" },
            h("span", { className: item.type === "PI_CON_EDF" ? "badge violet" : "badge green" }, item.type === "PI_CON_EDF" ? "PI con EDF" : "Sin EDF"),
            h("span", { className: item.priority === "Alta" ? "badge red" : "badge orange" }, item.priority)
          )
        ),
        h("div", { className: "text-sm text-stone-500" }, `PDV ${item.customer.id} · ${item.customer.supervisor} · ${item.customer.promoter} · ${item.customer.route} · ${item.customer.opportunityHl ?? 0} HL prom.`),
        h("div", { className: "text-sm font-bold text-emerald-700" }, `${oppRepayment.hl} HL promedio del periodo seleccionado`),
        h("div", { className: "mt-2 flex gap-2 items-center flex-wrap" },
          h("span", { className: "badge green" }, item.suggestedModel),
          h("span", { className: oppRepayment.pct >= 75 ? "badge green" : "badge teal" }, oppRepayment.kind === "actual" ? `${opportunityPctText(oppRepayment)} repago (${oppRepayment.compliant}/${oppRepayment.total})` : `${opportunityPctText(oppRepayment)} proyectado`),
          item.currentEdfCount ? h("span", { className: "badge violet" }, `${item.currentEdfCount} EDF ${item.currentBusinesses?.join("/") || ""}`) : null,
          ...(item.customer.piTypes || []).map((type) => h("span", { className: "badge lime" }, `PI ${type}`)),
          item.customer.pi && h("span", { className: "badge green" }, "Ya en PI"),
          !item.customer.pi && h("button", { className: "btn", onClick: () => addPi(item.customer.id) }, h(Icon, { name: "Star" }), "Agregar a PI")
        )
      );
    })),
    tab === "opportunities" && h("div", { className: "panel" },
      h("div", { className: "flex items-center justify-between mb-3" },
        h("h2", { className: "font-black" }, "Clientes agregados a PI"),
        h("span", { className: "badge lime" }, `${(state.piEvents || []).length} registros`)
      ),
      (state.piEvents || []).slice(0, 8).map((event) => {
        const customer = state.customers.find((row) => row.id === event.customerId);
        return h("div", { className: "border-b py-2", key: event.id },
          h("div", { className: "flex items-center justify-between gap-3" },
            h("div", null,
              h("b", null, customer?.name || event.customerId),
              h("div", { className: "text-sm text-stone-500" }, `PDV ${event.customerId} - ${customer?.supervisor || "Sin supervisor"} - ${customer?.promoter || "Sin promotor"} - ${new Date(event.at).toLocaleString()} - ${event.user}`)
            ),
            h("div", { className: "flex gap-2 flex-wrap justify-end" },
              h("span", { className: "badge green" }, "Agregado"),
              ...(customer?.piTypes || []).map((type) => h("span", { className: "badge lime" }, `PI ${type}`))
            )
          )
        );
      }),
      !(state.piEvents || []).length && h("div", { className: "text-sm text-stone-500" }, "Todavia no agregaste clientes a PI desde esta herramienta.")
    ),
    tab === "opportunities" && h("div", { className: "panel" },
      h("h2", { className: "font-black mb-3" }, "Últimos agregados a PI"),
      (state.piEvents || []).slice(0, 8).map((event) => {
        const customer = state.customers.find((row) => row.id === event.customerId);
        return h("div", { className: "border-b py-2", key: event.id },
          h("b", null, customer?.name || event.customerId),
          h("div", { className: "text-sm text-stone-500" }, `PDV ${event.customerId} · ${new Date(event.at).toLocaleString()} · ${event.user}`)
        );
      })
    ),
    tab === "customers" && h("div", { className: "panel" },
      h("div", { className: "flex items-center justify-between mb-3 gap-3" },
        h("div", null,
          h("h2", { className: "font-black" }, "Todos los clientes"),
          h("div", { className: "text-sm text-stone-500" }, `Periodo de referencia: ${commercialPeriodOptions.find(([key]) => key === commercialPeriod)?.[1] || "Año 2026"}`)
        ),
        h("span", { className: "badge teal" }, `${allCustomerRows.length} clientes`)
      ),
      h("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 mb-3" },
        h("select", { className: "input", value: customerRepaysFilter, onChange: (e) => setCustomerRepaysFilter(e.target.value) },
          h("option", { value: "todos" }, "Repaga y no repaga"),
          h("option", { value: "repaga" }, "Solo repagaría"),
          h("option", { value: "no" }, "Solo no repagaría")
        ),
        h("input", { className: "input", value: opportunityQuery, onChange: (e) => setOpportunityQuery(e.target.value), placeholder: "Buscar cliente, codigo, ruta o promotor..." })
      ),
      h("div", { className: "table-wrap" },
        h("table", null,
          h("thead", null, h("tr", null, ["Código", "Cliente", "Supervisor", "Promotor", "Ruta", "HL período", "Resultado", "EDF colocados", "PI"].map((x) => h("th", null, x)))),
          h("tbody", null, allCustomerRows.map(({ customer, fit, placed }) => h("tr", { key: customer.id },
            h("td", { className: "font-bold" }, customer.id),
            h("td", null, customer.name),
            h("td", null, customer.supervisor || "Sin supervisor"),
            h("td", null, customer.promoter || customer.seller || "Sin promotor"),
            h("td", null, customer.route || "-"),
            h("td", null, fit.hl),
            h("td", null, h("span", { className: `badge ${fit.color}` }, `${fit.status} ${fit.model} · ${opportunityPctText(fit)}`)),
            h("td", null, placed.length ? h("span", { className: "badge violet" }, `${placed.length} EDF ${uniqueValues(placed.map((edf) => edf.business || "OTROS")).join("/")}`) : h("span", { className: "badge gray" }, "Sin EDF")),
            h("td", null, customer.pi ? h("span", { className: "badge lime" }, (customer.piTypes || []).join("/") || "PI") : h("span", { className: "badge gray" }, "No PI"))
          )))
        )
      )
    ),
    tab === "mix" && h("div", { className: "panel" },
      h("div", { className: "flex items-center justify-between mb-3" }, h("h2", { className: "font-black" }, "Mix de clientes"), h("span", { className: "badge teal" }, `${mixRows.length} EDF`)),
      mixRows.map((edf) =>
      {
        const repayment = commercialRepayment(edf);
        return h("div", { className: "border-b py-3", key: edf.id },
        h("div", { className: "flex justify-between gap-3" },
          h("b", null, edf.customer.name),
          h("div", { className: "flex gap-2 flex-wrap" },
            h("span", { className: "badge violet" }, edf.model),
            h("span", { className: "badge teal" }, edf.business || "OTROS"),
            h("span", { className: repayment.pct >= 75 ? "badge green" : "badge red" }, repayment.pct >= 75 ? "Repaga" : "No repaga"),
            h("span", { className: `badge ${repayment.band?.color || "gray"}` }, `${repayment.pct}%`),
            h("span", { className: edf.mix?.priority === "Alta" ? "badge red" : edf.mix?.priority === "Media" ? "badge orange" : "badge gray" }, `Mix ${edf.mix?.priority || "Baja"}`)
          )
        ),
        h("div", { className: "text-sm text-stone-500 mt-1" }, `${edf.customer.supervisor} · ${edf.customer.promoter}`),
        h("div", { className: "text-sm mt-1" }, "Marcas actuales: ", (edf.mix.currentBrands || []).slice(0, 8).join(", ") || "Sin marcas"),
        h("div", { className: "text-sm text-stone-500 mt-1" }, "Marcas faltantes CZA: ", (edf.mix.missingBrandsCza || []).slice(0, 6).join(", ") || "-"),
        h("div", { className: "text-sm text-stone-500" }, "Marcas faltantes UNG: ", (edf.mix.missingBrandsUng || []).slice(0, 6).join(", ") || "-"),
        h("div", { className: "text-sm text-stone-500" }, "Categorias faltantes: ", [...(edf.mix.missingCza || []), ...(edf.mix.missingUng || [])].slice(0, 8).join(", ") || "-")
      );
      }
    ))
  );
}

function Alerts({ state }) {
  const [severity, setSeverity] = useState("todos");
  const [type, setType] = useState("todos");
  const types = [...new Set(state.alerts.map((alert) => alert.type))].sort();
  const filtered = state.alerts.filter((alert) =>
    (severity === "todos" || alert.severity === severity) &&
    (type === "todos" || alert.type === type)
  );
  const counts = state.alerts.reduce((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] || 0) + 1;
    return acc;
  }, {});
  return h("section", { className: "space-y-4" },
    h("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-2" },
      h("div", { className: "metric-card" }, h("span", { className: "badge red" }, "Críticas"), h("b", { className: "text-3xl" }, counts.critical || 0)),
      h("div", { className: "metric-card" }, h("span", { className: "badge orange" }, "Revisar"), h("b", { className: "text-3xl" }, counts.warning || 0)),
      h("div", { className: "metric-card" }, h("span", { className: "badge teal" }, "Info"), h("b", { className: "text-3xl" }, counts.info || 0)),
      h("div", { className: "metric-card" }, h("span", { className: "badge gray" }, "Total"), h("b", { className: "text-3xl" }, state.alerts.length))
    ),
    h("div", { className: "panel" },
      h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2" },
        h("select", { className: "input", value: severity, onChange: (e) => setSeverity(e.target.value) },
          h("option", { value: "todos" }, "Todas las severidades"),
          h("option", { value: "critical" }, "Críticas"),
          h("option", { value: "warning" }, "Revisar"),
          h("option", { value: "info" }, "Info")
        ),
        h("select", { className: "input", value: type, onChange: (e) => setType(e.target.value) },
          h("option", { value: "todos" }, "Todos los tipos"),
          types.map((name) => h("option", { value: name }, alertTypeLabel(name)))
        ),
        h("div", { className: "badge teal justify-center h-10" }, `${filtered.length} alertas visibles`)
      )
    ),
    h("section", { className: "panel" }, h("h2", { className: "font-black mb-3" }, "Problemas operativos detectados"), h(AlertList, { alerts: filtered }))
  );
}

function alertTypeLabel(type) {
  const labels = {
    EDF_SIN_VENTA: "EDF sin venta",
    EDF_BAJO_75: "EDF bajo 75%",
    EDF_DUPLICADO: "EDF duplicado",
    EDF_SIN_ACTIVO: "EDF sin activo",
    EDF_SIN_SERIE: "EDF sin serie",
    STOCK_ASIGNADO: "Stock asignado",
    CLIENTE_MULTI_EDF: "Cliente con más de un EDF",
    CLIENTE_PI_SIN_EDF: "Cliente PI sin EDF",
    MIX_INCOMPLETO: "Mix incompleto"
  };
  return labels[type] || type;
}

function AlertList({ alerts }) {
  return h("div", { className: "space-y-2" }, alerts.map((a) => h("div", { className: "flex items-center justify-between border-b pb-2", key: a.id },
    h("div", null, h("b", null, a.label), h("div", { className: "text-sm text-stone-500" }, a.asset || a.customerName || a.customerId || "")),
    h("span", { className: `badge ${a.severity === "critical" ? "red" : a.severity === "warning" ? "orange" : "teal"}` }, a.severity)
  )));
}

function RankingPanel({ title, rows }) {
  return h("div", { className: "panel" },
    h("h2", { className: "font-black mb-3" }, title),
    h("div", { className: "space-y-2" }, rows.map((edf) => h("div", { className: "flex items-center justify-between border-b pb-2", key: edf.id },
      h("div", null,
        h("b", null, edf.customer?.name || edf.asset),
        h("div", { className: "text-sm text-stone-500" }, `${edf.customer?.id ? `PDV ${edf.customer.id} · ` : ""}${edf.business || edf.model} · ${edf.count ? `${edf.count} EDF` : edf.asset || ""}`)
      ),
      h("span", { className: `badge ${edf.repayment.band.color}` }, `${edf.repayment.pct}%`)
    )))
  );
}

function Audit({ state }) {
  return h("section", { className: "table-wrap" },
    h("table", null,
      h("thead", null, h("tr", null, ["Fecha", "Usuario", "Acción", "Detalle"].map((x) => h("th", null, x)))),
      h("tbody", null, state.audit.map((a) => h("tr", { key: a.id }, h("td", null, new Date(a.at).toLocaleString()), h("td", null, a.user), h("td", null, h("span", { className: "badge teal" }, a.action)), h("td", null, JSON.stringify(a.changes).slice(0, 120)))))
    )
  );
}

function Mails({ state, setState }) {
  const [rows, setRows] = useState(state.recipients);
  async function save() {
    const res = await fetch("/api/recipients", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients: rows, user: "Operador EDF" }) });
    const data = await res.json();
    setState(data.state);
  }
  return h("section", { className: "panel" },
    h("div", { className: "flex justify-between items-center mb-3" }, h("h2", { className: "font-black" }, "Agenda por localidad"), h("button", { className: "btn primary", onClick: save }, h(Icon, { name: "Save" }), "Guardar")),
    h("div", { className: "space-y-2" }, rows.map((row, index) => h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", key: row.city },
      h("input", { className: "input", value: row.city, onChange: (e) => setRows(updateRows(rows, index, "city", e.target.value)) }),
      h("input", { className: "input md:col-span-2", value: row.recipients, onChange: (e) => setRows(updateRows(rows, index, "recipients", e.target.value)) })
    ))),
    h("button", { className: "btn mt-3", onClick: () => setRows([...rows, { city: "", recipients: "" }]) }, h(Icon, { name: "Plus" }), "Agregar localidad")
  );
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function updateRows(rows, index, key, value) {
  return rows.map((row, i) => i === index ? { ...row, [key]: value } : row);
}

function MovementModal({ state, selected, close, submitMovement, defaultType }) {
  const [type, setType] = useState(defaultType || "COMODATO");
  const [items, setItems] = useState((selected.length ? selected : []).map((edfId) => ({ edfId, customerId: "", deposit: "TRELEW" })));
  const [edfQuery, setEdfQuery] = useState("");
  const [edfSearchType, setEdfSearchType] = useState("all");
  const edfs = state.edfs;
  const customers = state.customers;
  const q = edfQuery.trim().toLowerCase();
  const filteredEdfs = q
    ? edfs.filter((edf) => {
        if (edfSearchType === "asset") return String(edf.asset || "").toLowerCase().includes(q);
        if (edfSearchType === "serial") return String(edf.serial || "").toLowerCase().includes(q);
        if (edfSearchType === "customer") return String(edf.customerId || "").toLowerCase().includes(q);
        return [edf.asset, edf.serial, edf.customerId].some((value) => String(value || "").toLowerCase().includes(q));
      }).slice(0, 80)
    : edfs.slice(0, 120);
  function addRow() {
    setItems([...items, { edfId: filteredEdfs[0]?.id || edfs[0]?.id, customerId: customers[0]?.id, deposit: "TRELEW" }]);
  }
  function addEdf(edfId) {
    if (!edfId) return;
    setItems([...items, { edfId, customerId: "", deposit: "TRELEW" }]);
  }
  return h("div", { className: "modal-backdrop" },
    h("div", { className: "modal-card" },
      h("div", { className: "flex justify-between items-center mb-4" }, h("h2", { className: "text-xl font-black" }, "Movimiento EDF"), h("button", { className: "btn icon", onClick: close }, h(Icon, { name: "X" }))),
      h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2 mb-3" },
        h("select", { className: "input", value: type, onChange: (e) => setType(e.target.value) }, movementTypes.map((m) => h("option", { value: m }, m))),
        h("button", { className: "btn", onClick: addRow }, h(Icon, { name: "Plus" }), "Agregar EDF"),
        h("button", { className: "btn primary", onClick: () => submitMovement({ type, user: "Operador EDF", items }) }, h(Icon, { name: "Check" }), "Confirmar y generar mail")
      ),
      h("div", { className: "panel mb-3" },
        h("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-2" },
          h("select", { className: "input", value: edfSearchType, onChange: (e) => setEdfSearchType(e.target.value) },
            h("option", { value: "all" }, "Todo"),
            h("option", { value: "asset" }, "Activo"),
            h("option", { value: "serial" }, "Serie"),
            h("option", { value: "customer" }, "Código cliente")
          ),
          h("input", { className: "input md:col-span-2", value: edfQuery, onChange: (e) => setEdfQuery(e.target.value), placeholder: "Buscar por cualquier parte del número..." }),
          h("select", { className: "input", onChange: (e) => addEdf(e.target.value), value: "" },
            h("option", { value: "" }, q ? `${filteredEdfs.length} resultados` : "Elegir EDF"),
            filteredEdfs.map((edf) => h("option", { value: edf.id }, `${edf.asset || "Sin activo"} · ${edf.serial} · ${edf.statusLabel}`))
          )
        )
      ),
      h("div", { className: "space-y-2" }, items.map((item, index) => h("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", key: index },
        h("select", { className: "input", value: item.edfId, onChange: (e) => setItems(updateRows(items, index, "edfId", e.target.value)) },
          edfs.find((edf) => edf.id === item.edfId) && !filteredEdfs.some((edf) => edf.id === item.edfId)
            ? [edfs.find((edf) => edf.id === item.edfId), ...filteredEdfs].map((edf) => h("option", { value: edf.id }, `${edf.asset || "Sin activo"} · ${edf.serial} · ${edf.statusLabel}`))
            : filteredEdfs.map((edf) => h("option", { value: edf.id }, `${edf.asset || "Sin activo"} · ${edf.serial} · ${edf.statusLabel}`))
        ),
        h("select", { className: "input", value: item.customerId, onChange: (e) => setItems(updateRows(items, index, "customerId", e.target.value)) }, h("option", { value: "" }, "Sin cliente"), customers.map((customer) => h("option", { value: customer.id }, `${customer.id} · ${customer.name}`))),
        h("select", { className: "input", value: item.deposit, onChange: (e) => setItems(updateRows(items, index, "deposit", e.target.value)) }, deposits.map((deposit) => h("option", { value: deposit }, deposit)))
      )))
    )
  );
}

function MailModal({ mail, close }) {
  return h("div", { className: "modal-backdrop" },
    h("div", { className: "modal-card" },
      h("div", { className: "flex justify-between items-center mb-4" }, h("h2", { className: "text-xl font-black" }, "Mail automático consolidado"), h("button", { className: "btn icon", onClick: close }, h(Icon, { name: "X" }))),
      h("div", { className: "space-y-2" },
        h("p", null, h("b", null, "Para: "), mail.recipients || "Sin destinatarios configurados"),
        h("p", null, h("b", null, "Asunto: "), mail.subject),
        h("p", null, mail.body),
        mail.mailto && h("a", { className: "btn primary", href: mail.mailto }, h(Icon, { name: "Send" }), "Enviar mail")
      ),
      h("div", { className: "table-wrap mt-4" }, h("table", null, h("thead", null, h("tr", null, ["Activo", "Serie", "Modelo", "Cliente", "Localidad", "Destino"].map((x) => h("th", null, x)))), h("tbody", null, mail.rows.map((r, i) => h("tr", { key: i }, Object.values(r).map((v) => h("td", null, v)))))))
    )
  );
}

function HistoryModal({ state, edfId, close }) {
  const edf = state.edfs.find((e) => e.id === edfId);
  const entries = state.movements.filter((m) => m.items.some((item) => item.edfId === edfId));
  return h("div", { className: "modal-backdrop" },
    h("div", { className: "modal-card" },
      h("div", { className: "flex justify-between items-center mb-4" }, h("h2", { className: "text-xl font-black" }, `Historial ${edf.asset || edf.serial}`), h("button", { className: "btn icon", onClick: close }, h(Icon, { name: "X" }))),
      entries.length ? entries.map((m) => h("div", { className: "border-b py-3" }, h("b", null, m.type), h("div", { className: "text-sm text-stone-500" }, `${new Date(m.at).toLocaleString()} · ${m.user}`))) : h("p", { className: "text-stone-500" }, "Sin movimientos registrados todavía.")
    )
  );
}

root.render(h(App));
