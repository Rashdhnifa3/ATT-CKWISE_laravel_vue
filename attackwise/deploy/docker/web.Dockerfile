# syntax=docker/dockerfile:1
# ATT&CKWISE web image: the Vue build served by Nginx. Build context: attackwise/ (a clean
# `git archive` export, see deploy/build-release.sh). Node and the Vue toolchain exist only in the
# build stage; the runtime image contains Nginx, its config and the static files.

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS build
WORKDIR /src
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_config_audit=false npm_config_fund=false npm_config_update_notifier=false
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ ./
# vue-tsc type check + vite production build; source maps are not shipped.
RUN npm run build && find dist -name '*.map' -delete

FROM nginx:1.30.7-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3 AS runtime
ARG ATTACKWISE_VERSION=dev
ARG ATTACKWISE_REVISION=unknown
LABEL org.opencontainers.image.title="attackwise-web" \
      org.opencontainers.image.description="ATT&CKWISE Vue frontend served by Nginx" \
      org.opencontainers.image.version="${ATTACKWISE_VERSION}" \
      org.opencontainers.image.revision="${ATTACKWISE_REVISION}" \
      org.opencontainers.image.licenses="Apache-2.0"
# The stock entrypoint scripts rewrite files under /etc/nginx; this image is configured statically
# and runs read-only as the unprivileged nginx user.
RUN rm -f /docker-entrypoint.d/*.sh /etc/nginx/conf.d/default.conf
COPY deploy/docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/nginx/site.conf deploy/docker/nginx/security-headers.conf /etc/nginx/attackwise/
COPY deploy/docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/ /usr/share/nginx/html/
RUN printf '{"name":"attackwise","version":"%s","commit":"%s"}\n' "$ATTACKWISE_VERSION" "$ATTACKWISE_REVISION" > /usr/share/nginx/html/version.json \
 && chown -R root:root /usr/share/nginx/html && chmod -R a+rX,go-w /usr/share/nginx/html \
 && nginx -t -c /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080 8443
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
