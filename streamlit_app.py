import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd
import plotly.express as px
import streamlit as st

from scripts.sync_google_drive import sync_google_drive


ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "db.json"


st.set_page_config(
    page_title="EDF Repago",
    page_icon="📊",
    layout="wide",
)


def secret_or_env(name: str, default: str = "") -> str:
    try:
        return str(st.secrets.get(name, os.environ.get(name, default)))
    except Exception:
        return os.environ.get(name, default)


@st.cache_data(show_spinner=False)
def load_db() -> Optional[Dict[str, Any]]:
    if not DB_PATH.exists():
        return None
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


def status_label(edf: Dict[str, Any]) -> str:
    status = edf.get("status") or ""
    if status == "PDV":
        return "En PDV"
    if status == "DEPOSITO":
        return "Deposito"
    return status.title() if status else "-"


def repayment_pct(edf: Dict[str, Any]) -> int:
    repayment = edf.get("repayment") or {}
    try:
        return int(repayment.get("pct") or 0)
    except Exception:
        return 0


def render_dashboard(db: Dict[str, Any]) -> None:
    edfs = db.get("edfs", [])
    customers = db.get("customers", [])
    placed = [edf for edf in edfs if edf.get("status") == "PDV"]
    available = [edf for edf in edfs if edf.get("status") in {"STOCK", "DEPOSITO"}]
    under_75 = [edf for edf in placed if repayment_pct(edf) < 75]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total EDF", len(edfs))
    c2.metric("Disponibles", len(available))
    c3.metric("En PDV", len(placed))
    c4.metric("Bajo 75%", len(under_75))

    rows = []
    for edf in edfs:
        customer = edf.get("customer") or {}
        repayment = edf.get("repayment") or {}
        rows.append(
            {
                "Cliente": customer.get("name") or "",
                "Codigo": customer.get("id") or edf.get("customerId") or "",
                "Negocio": edf.get("business") or "",
                "Supervisor": customer.get("supervisor") or "Sin supervisor",
                "Promotor": customer.get("promoter") or customer.get("seller") or "Sin promotor",
                "EDF": edf.get("asset") or "",
                "Serie": edf.get("serial") or "",
                "Modelo": edf.get("model") or "",
                "Estado": status_label(edf),
                "HL": repayment.get("hl") or 0,
                "% Repago": repayment.get("pct") or 0,
            }
        )

    df = pd.DataFrame(rows)
    st.subheader("Repago")
    filters = st.columns(3)
    business = filters[0].selectbox("Negocio", ["Todos"] + sorted([x for x in df["Negocio"].dropna().unique() if x]))
    supervisor = filters[1].selectbox("Supervisor", ["Todos"] + sorted([x for x in df["Supervisor"].dropna().unique() if x]))
    query = filters[2].text_input("Buscar cliente, codigo, EDF o serie")

    filtered = df.copy()
    if business != "Todos":
        filtered = filtered[filtered["Negocio"] == business]
    if supervisor != "Todos":
        filtered = filtered[filtered["Supervisor"] == supervisor]
    if query:
        q = query.lower()
        filtered = filtered[filtered.apply(lambda row: q in " ".join(map(str, row.values)).lower(), axis=1)]

    st.dataframe(filtered, use_container_width=True, hide_index=True)
    st.download_button(
        "Exportar Excel CSV",
        filtered.to_csv(index=False, sep=";").encode("utf-8-sig"),
        "repago_edf.csv",
        "text/csv",
    )

    if not filtered.empty:
        grouped = (
            filtered[filtered["Estado"] == "En PDV"]
            .groupby("Negocio", as_index=False)
            .agg(EDF=("EDF", "count"), RepagoPromedio=("% Repago", "mean"))
        )
        if not grouped.empty:
            st.subheader("Repago promedio por negocio")
            fig = px.bar(grouped, x="Negocio", y="RepagoPromedio", color="Negocio", text_auto=".0f")
            st.plotly_chart(fig, use_container_width=True)

    st.subheader("Clientes")
    customer_df = pd.DataFrame(customers)
    if not customer_df.empty:
        st.dataframe(customer_df, use_container_width=True, hide_index=True)


st.title("EDF Repago")
st.caption("by QπU")

drive_url = secret_or_env("GOOGLE_DRIVE_FOLDER_URL")
source_dir = secret_or_env("EDF_SOURCE_DIR", "data/drive-source")

with st.sidebar:
    st.header("Fuente de datos")
    st.write("Drive configurado" if drive_url else "Drive sin configurar")
    st.code(drive_url or "Falta GOOGLE_DRIVE_FOLDER_URL", language="text")
    st.code(source_dir, language="text")
    if st.button("Sincronizar Drive"):
        if not drive_url:
            st.error("Falta configurar GOOGLE_DRIVE_FOLDER_URL en Secrets.")
        else:
            with st.spinner("Sincronizando archivos..."):
                result = sync_google_drive(drive_url, source_dir)
            st.success(f"Archivos sincronizados: {result}")
            st.cache_data.clear()

db = load_db()
if db:
    render_dashboard(db)
else:
    st.warning("La app cargó, pero todavía no hay base `data/db.json` generada para mostrar el dashboard.")
    st.write("Primero sincronizá Drive desde la barra lateral. El próximo paso es completar el importador Python para Streamlit Cloud.")
    source_path = ROOT / source_dir
    if source_path.exists():
        files = [{"Archivo": p.name, "Tamaño": p.stat().st_size} for p in source_path.iterdir() if p.is_file()]
        st.subheader("Archivos encontrados")
        st.dataframe(pd.DataFrame(files), use_container_width=True, hide_index=True)
