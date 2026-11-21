# syntax=docker/dockerfile:1
# ATT&CKWISE API image: Laravel (read-only ATT&CK API) on PHP-FPM. Build context: attackwise/
# (clean `git archive` export). Composer exists only in the build stage; production
# dependencies come from backend/composer.lock (--no-dev). No .env, tests or dev tools are copied.

FROM composer:2.9.5@sha256:698d3801b2a622ace460c4743c781282fcbcb733a4cbf8b31c44731e846585e8 AS composer

FROM php:8.5.13-fpm-alpine@sha256:51414d5291758fe27f58a64c7e8a078465d32cc7dcef7bda803f5b36019802e0 AS vendor
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-progress --no-scripts --no-autoloader
COPY backend/ ./
RUN rm -rf .env .env.* tests phpunit.xml storage/logs/* storage/framework/*/* bootstrap/cache/*.php node_modules \
 && composer dump-autoload --no-dev --optimize \
 && composer check-platform-reqs --no-dev \
 && php artisan package:discover --ansi \
 && rm -f vendor/laravel/framework/src/Illuminate/Foundation/resources/exceptions/renderer/package-lock.json /usr/local/bin/composer

FROM php:8.5.13-fpm-alpine@sha256:51414d5291758fe27f58a64c7e8a078465d32cc7dcef7bda803f5b36019802e0 AS runtime
ARG ATTACKWISE_VERSION=dev
ARG ATTACKWISE_REVISION=unknown
LABEL org.opencontainers.image.title="attackwise-api" \
      org.opencontainers.image.description="ATT&CKWISE read-only ATT&CK API (Laravel, PHP-FPM)" \
      org.opencontainers.image.version="${ATTACKWISE_VERSION}" \
      org.opencontainers.image.revision="${ATTACKWISE_REVISION}" \
      org.opencontainers.image.licenses="Apache-2.0"
# fcgi provides cgi-fcgi for the PHP-FPM healthcheck only.
RUN apk add --no-cache fcgi
COPY deploy/docker/php/attackwise.ini /usr/local/etc/php/conf.d/zz-attackwise.ini
COPY deploy/docker/php/zz-attackwise.conf /usr/local/etc/php-fpm.d/zz-attackwise.conf
COPY --chmod=0755 deploy/docker/api-entrypoint.sh /usr/local/bin/attackwise-api-entrypoint
COPY --from=vendor /app /var/www/html
WORKDIR /var/www/html
# Code is owned by root and read-only for PHP; www-data may write only the ATT&CK cache volume and
# the tmpfs mounts declared in compose.yaml (storage/framework, storage/logs, /tmp).
RUN chown -R root:root /var/www/html && chmod -R a+rX,go-w /var/www/html \
 && mkdir -p /var/lib/attackwise/attack-cache && chown www-data:www-data /var/lib/attackwise/attack-cache \
 && php -m | grep -qi 'zend opcache' && php -m | grep -qx curl
# Production defaults; compose.yaml repeats the non-negotiable ones so a config file cannot override them.
ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    LOG_LEVEL=warning \
    CACHE_STORE=array \
    SESSION_DRIVER=array \
    QUEUE_CONNECTION=sync \
    BROADCAST_CONNECTION=null \
    DB_CONNECTION=sqlite \
    DB_DATABASE=":memory:" \
    ATTACKWISE_CACHE_DIR=/var/lib/attackwise/attack-cache \
    APP_CONFIG_CACHE=/tmp/laravel/config.php \
    APP_ROUTES_CACHE=/tmp/laravel/routes.php \
    APP_EVENTS_CACHE=/tmp/laravel/events.php
USER www-data
VOLUME ["/var/lib/attackwise/attack-cache"]
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/attackwise-api-entrypoint"]
CMD ["php-fpm"]
