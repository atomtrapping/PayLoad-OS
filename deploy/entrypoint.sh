#!/bin/sh
set -eu
umask 077
cd /app
mode="${1:-web}"
if [ "$#" -gt 1 ]; then echo "Deployment role refused." >&2; exit 1; fi
case "$mode" in web|worker|publisher) ;; *) echo "Deployment role refused." >&2; exit 1 ;; esac
node .stamp/deployment-preflight.cjs "$mode"
# No collectors, migration, seed, lake process or cron is started implicitly.
case "$mode" in
  web) exec node server.js ;;
  worker) exec node .stamp/terminal-service.mjs worker ;;
  publisher) exec node .stamp/terminal-service.mjs publisher ;;
esac
