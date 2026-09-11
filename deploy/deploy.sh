#!/usr/bin/env bash
#
# Despliegue automatico de ReservaYa (front Angular SSR) a AWS.
# S3 (assets) + Lambda (Lambda Web Adapter) + CloudFront, via AWS CDK.
#
# Requisitos:
#   - Credenciales AWS configuradas:  aws configure
#   - Docker Desktop corriendo (se construye la imagen de Lambda)
#   - Node 22 + npm
#
# Uso:
#   ./deploy/deploy.sh                # despliega (build + synth + deploy)
#   DESPLEGAR=no ./deploy/deploy.sh   # solo build + synth (no deploy)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${PROJECT_ROOT}/deploy/infra"
OUTPUTS_FILE="${PROJECT_ROOT}/deploy/cdk-outputs.json"
DESPLEGAR="${DESPLEGAR:-yes}"

paso() { printf '\n==> %s\n' "$*"; }

paso "1/6  Verificando credenciales AWS"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)" || {
  echo "ERROR: no hay credenciales AWS validas. Ejecuta 'aws configure'." >&2
  exit 1
}
REGION="${AWS_REGION:-$(aws configure get region)}"; : "${REGION:=us-east-1}"
echo "      Cuenta: ${ACCOUNT_ID} | Region: ${REGION}"

paso "2/6  Verificando Docker"
docker info >/dev/null 2>&1 || { echo "ERROR: Docker no esta corriendo. Inicia Docker Desktop y reintenta." >&2; exit 1; }
echo "      Docker OK"

paso "3/6  Dependencias del front"
if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
  npm ci --prefix "${PROJECT_ROOT}" --legacy-peer-deps
else
  echo "      node_modules presente; se omite npm ci"
fi

paso "4/6  Build de la app (genera dist/reserwaya)"
npm --prefix "${PROJECT_ROOT}" run build

paso "5/6  Dependencias de CDK"
if [ ! -d "${INFRA_DIR}/node_modules" ]; then
  npm --prefix "${INFRA_DIR}" install
else
  echo "      dependencias CDK presentes; se omite npm install"
fi

paso "6/6  Bootstrap + deploy CDK  (${ACCOUNT_ID}/${REGION})"
(
  cd "${INFRA_DIR}" || exit 1
  npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" --require-approval never
  if [ "${DESPLEGAR}" = "yes" ]; then
    npx cdk deploy --require-approval never --outputs-file "${OUTPUTS_FILE}"
  else
    npx cdk synth
    echo "      (DESPLEGAR=no: solo synth, no se modifico la cuenta)"
  fi
)

echo
echo "==> Despliegue completado"
if [ -f "${OUTPUTS_FILE}" ] && [ "${DESPLEGAR}" = "yes" ]; then
  URL="$(node -e "try{const o=require('${OUTPUTS_FILE}');console.log(o.ReserwayaFrontStack?.CloudFrontUrl??'')}catch(e){console.log('')}")"
  if [ -n "${URL}" ]; then
    echo "    URL de produccion: ${URL}"
    echo "    (verifica el dominio en la consola de CloudFront; la primera replica tarda unos minutos)"
  else
    echo "    Outputs: $(cat "${OUTPUTS_FILE}")"
  fi
fi