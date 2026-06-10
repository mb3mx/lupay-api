#!/usr/bin/env bash
# Limpia archivos cargados y todo lo derivado de ellos.
#
# Tablas truncadas: file_control, transaction, settlement, reconciliation,
#                   payout, payout_item, liquidacion, liquidacion_item,
#                   devolucion, contracargo.
#
# Tablas que NO se tocan: user, client, terminal, sindicato, liquidadora.
#
# Archivos fisicos: borra uploads/*.xlsx (mantiene uploads/avatars/).
#
# Uso:
#   ./scripts/clean-files.sh           # pide confirmacion
#   ./scripts/clean-files.sh --yes     # sin confirmacion (para CI/loops)
#   ./scripts/clean-files.sh --counts  # solo muestra conteos, no borra
#
# Conexion a Postgres (en este orden):
#   1) Variable DATABASE_URL si esta exportada
#   2) Lectura de .env (DATABASE_URL=...)
#   3) docker exec lupay_db psql ... (fallback con credenciales por defecto)

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Argumentos ---
YES=0
COUNTS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes)    YES=1 ;;
    -c|--counts) COUNTS_ONLY=1 ;;
    -h|--help)
      grep -E "^# " "$0" | sed 's/^# \{0,1\}//' | head -25
      exit 0
      ;;
    *)
      echo "Argumento desconocido: $arg (usa --help)"; exit 2 ;;
  esac
done

# --- Resolver como ejecutar psql ---
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set +u
  export $(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/' | xargs -I{} echo DATABASE_URL='{}')
  set -u
fi

run_psql() {
  local query="$1"
  if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -t -c "$query"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^lupay_db$'; then
    docker exec lupay_db psql -U mb3_lupay -d lupay -v ON_ERROR_STOP=1 -t -c "$query"
  else
    echo "ERROR: ni psql local con DATABASE_URL ni contenedor lupay_db disponibles." >&2
    exit 1
  fi
}

print_counts() {
  echo "$1"
  run_psql "
    SELECT '  file_control     ' AS tabla, COUNT(*) FROM file_control
    UNION ALL SELECT '  transaction      ', COUNT(*) FROM transaction
    UNION ALL SELECT '  settlement       ', COUNT(*) FROM settlement
    UNION ALL SELECT '  reconciliation   ', COUNT(*) FROM reconciliation
    UNION ALL SELECT '  payout           ', COUNT(*) FROM payout
    UNION ALL SELECT '  payout_item      ', COUNT(*) FROM payout_item
    UNION ALL SELECT '  liquidacion      ', COUNT(*) FROM liquidacion
    UNION ALL SELECT '  liquidacion_item ', COUNT(*) FROM liquidacion_item
    UNION ALL SELECT '  devolucion       ', COUNT(*) FROM devolucion
    UNION ALL SELECT '  contracargo      ', COUNT(*) FROM contracargo;
  "
}

# --- Solo conteos ---
if [ "$COUNTS_ONLY" -eq 1 ]; then
  print_counts "Conteos actuales:"
  exit 0
fi

# --- Mostrar conteo previo + confirmar ---
print_counts "ANTES de limpiar:"

if [ "$YES" -eq 0 ]; then
  echo ""
  read -r -p "Confirma el borrado [s/N]: " ans
  case "$ans" in
    s|S|si|SI|y|Y|yes) ;;
    *) echo "Cancelado."; exit 0 ;;
  esac
fi

# --- Truncate ---
echo ""
echo ">> Truncando tablas..."
run_psql "
  TRUNCATE TABLE
    reconciliation,
    payout_item, payout,
    liquidacion_item, liquidacion,
    devolucion, contracargo,
    settlement, transaction, file_control
  RESTART IDENTITY CASCADE;
" >/dev/null

# --- Archivos fisicos ---
echo ">> Borrando uploads/*.xlsx..."
if [ -d uploads ]; then
  find uploads -maxdepth 1 -type f -name "*.xlsx" -delete
fi

# --- Conteo final ---
echo ""
print_counts "DESPUES:"
echo ""
echo "OK: limpieza completa."
