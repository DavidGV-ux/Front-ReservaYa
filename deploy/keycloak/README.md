# Keycloak alojado en AWS (académico)

Keycloak 26.7.3 corriendo 24/7 en una EC2 `t3.micro` (dentro del AWS Free Tier)
con Postgres 16, accesible por HTTPS a través de una distribución de CloudFront.

## Accesos

| Recurso | URL |
| --- | --- |
| Consola de admin de Keycloak | https://d5mklesn5mbc7.cloudfront.net/admin |
| Login de usuarios (realm `reserwaya`) | https://d5mklesn5mbc7.cloudfront.net/realms/reserwaya/protocol/openid-connect/auth |
| Front en producción (ReservaYa) | https://d1ydnh3hbo1zxr.cloudfront.net |
| Issuer OIDC usado por el front | https://d5mklesn5mbc7.cloudfront.net/realms/reserwaya |

Credenciales en `deploy/keycloak/secrets.env` (**gitignored**):
- `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`: administradores de la consola `/admin`.
- `DAVID_USER` / `DAVID_PASSWORD`: usuario `David` con rol `ry_admin`.
- `KC_DB_PASSWORD`: password del Postgres interno (sin acceso externo).

## Infraestructura (AWS, us-east-1)

- EC2 `i-049b4c4007a54bb76` (`t3.micro`, AMI AL2023, disco EBS 8 GiB, swap 2 GiB).
  - EIP `52.22.18.151`. SSH: `ssh -i deploy/keycloak/reserwaya-keycloak.pem ec2-user@52.22.18.151`.
  - Security group `reserwaya-kc-sg`: 22/SSH y 8080/Keycloak abiertos (demo académica).
- Contenedores en `/opt/keycloak` (`docker-compose.yml`): `postgres:16-alpine` + `quay.io/keycloak/keycloak:26.7.3`.
  - Config: `--http-enabled=true --proxy-headers=xforwarded --hostname-strict=false`, `KC_HOSTNAME=https://d5mklesn5mbc7.cloudfront.net`, heap limitado (512 MB) porque la instancia tiene 1 GiB.
  - Datos en el volumen Docker `keycloak_pgdata` (sobrevive reboots).
- CloudFront `E2ZY3MHJPH6WRC` (dominio `d5mklesn5mbc7.cloudfront.net`):
  origin custom en http://52.22.18.151:8080, cabecera `X-Forwarded-Proto: https`,
  sin caché, cookies hacia delante (necesarias para el login/admin).
- El front en producción apunta al issuer alojado (ver `src/app/core/config/environment.prod.ts`).

## Realm `reserwaya`

- Registro de usuarios **habilitado** (flujo "Register" en el login).
- Roles: `ry_admin`, `ry_owner`, `ry_professional`, `ry_client`.
- `ry_client` está compuesto dentro del rol por defecto del realm → **todo usuario
  que se registra obtiene `ry_client`** y puede entrar a `/app/client` y `mi-historial`.
- Client `reserwaya-web` (público, PKCE S256) con redirect URIs
  `http://localhost:4200/auth/callback` y `https://d1ydnh3hbo1zxr.cloudfront.net/auth/callback`.
- Protocol mapper `realm-roles-in-token` (`oidc-usermodel-realm-role-mapper`,
  claim `realm_access.roles`, en id_token y access_token).
- Usuarios: `David` (ry_admin).

Para regenerar toda la configuración del realm en otro Keycloak:
`./configure-realm.sh https://<keycloak-cf> https://<front-cf>`.

## Tema de login "reservaya"

El login, registro, recuperación de contraseña, OTP y consentimiento usan un
tema de marca propio (`deploy/keycloak/themes/reservaya/`), construido sobre
**Bootstrap 5** y **SweetAlert2** (assets versionados en el tema, sin CDN):

- `login/theme.properties` → `parent=keycloak`, mapea las clases `kc*Class` de
  los formularios base a clases Bootstrap (`form-control`, `form-label`,
  `input-group`, `btn btn-primary`, `w-100`, `mb-3`, …). Importante: **no usar
  `parent=keycloak.v2`**: en Keycloak 26 ese base renderiza formularios con
  PatternFly y **ignora el mapeo** `kc*Class`.
- `login/template.ftl` → shell del login (logo, selector de idioma, enlace
  "Volver al sitio"), carga Bootstrap + `js/sweetalert2.min.js` +
  `js/theme.js`; mantiene el contrato de secciones `header` / `form` / `info` /
  `socialProviders` de las plantillas base.
- `login/resources/` → `css/bootstrap.min.css`, `css/reservaya.css` (marca
  verde sobre Bootstrap), `img/favicon.svg`, `js/passwordVisibility.js` (de la
  base 26.7.3), `js/sweetalert2.min.js` y `js/theme.js`.
- `js/theme.js` → convierte los mensajes de Keycloak en popups de SweetAlert2
  (icono según `success|error|warning|info`); sin JS queda una alerta inline.
- `login/messages/` → claves custom ES/EN (`reservaya.backToSite`, títulos de
  los popups `reservaya.title.*`).

Configuración del realm aplicada por `configure-realm.sh` (importante: la
carpeta `themes` debe estar montada en `/opt/keycloak/themes` del contenedor;
es un bind-mount `:ro` del `docker-compose.yml`):

- `loginTheme=reservaya`.
- `displayName=ReservaYa`.
- `internationalizationEnabled=true`, `defaultLocale=es`, `supportedLocales=[en,es]`
  (el selector de idioma aparece en el login).
- Protección *brute force* activada (umbrella de la password policy del SPA;
  el back nunca recibe ni guarda contraseñas, ver ADR-1).

## Costo y free tier

- `t3.micro` 750 h/mes: incluido en el Free Tier de AWS (primeros 12 meses) y
  cubre una EIP pública. Fuera del tier: ~US$8/mes.
- EBS 8 GiB: dentro de los 30 GiB gratis. CloudFront: tráfico mínimo (~centavos).

## Notas / mantenimiento

- Reboot del servidor: `docker compose` tiene `restart: unless-stopped`
  (Postgres y Keycloak vuelven solos; la base persiste en el volumen).
- Backups: snapshot del volumen EBS de la instancia, o
  `docker compose exec db pg_dump -U keycloak keycloak`.
- Recomendado (no imprescindible para la demo): restringir el SG 8080 a los
  rangos de CloudFront y el 22 a tu IP.