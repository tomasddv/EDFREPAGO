import os
import sys
from pathlib import Path


def main() -> int:
    folder_url = os.environ.get("GOOGLE_DRIVE_FOLDER_URL", "").strip()
    output_dir = Path(os.environ.get("EDF_SOURCE_DIR", "data/drive-source"))

    if not folder_url:
        print("GOOGLE_DRIVE_FOLDER_URL no configurado; no se sincroniza Drive.")
        return 0

    try:
        import gdown
    except ImportError:
        print(
            "Falta instalar gdown. Ejecutar: python -m pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Sincronizando Google Drive: {folder_url}")
    print(f"Destino local: {output_dir.resolve()}")

    downloaded = gdown.download_folder(
        url=folder_url,
        output=str(output_dir),
        quiet=False,
        use_cookies=False,
        remaining_ok=True,
    )

    total = len(downloaded or [])
    print(f"Archivos sincronizados: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
