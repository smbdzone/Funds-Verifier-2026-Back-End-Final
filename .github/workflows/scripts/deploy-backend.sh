#!/usr/bin/env bash
set -e

echo "Starting Backend Deployment"

cd /home/ubuntu/Funds-Verifier-2026-Back-End-Final

echo "Getting latest code"
git fetch origin main
git checkout -B main origin/main
git reset --hard origin/main

# Install + syntax-check run in their own session (setsid), not just
# nohup'd, and polled via a marker file — not as a foreground command
# directly on this SSH connection. Lesson from the frontend pipeline
# (2026-09-07): nohup alone only protects the top-level process from
# SIGHUP; npm install spawns native-module build children (sharp,
# bcrypt, keccak, etc. all run node-gyp/make), which stay in the same
# process group and aren't individually immune to a SIGHUP from the
# session's controlling terminal going away. setsid detaches the whole
# tree into a brand-new session so no signal from this SSH session
# ending can reach any of it.
echo "Installing dependencies + syntax-check (detached)"
rm -f /tmp/fv-backend-deploy.log /tmp/fv-backend-deploy.done
setsid nohup bash -c '
  npm install && npm run build
  echo $? > /tmp/fv-backend-deploy.done
' </dev/null >/tmp/fv-backend-deploy.log 2>&1 &
disown

echo "Waiting for install + syntax-check to finish..."
for i in $(seq 1 120); do
  if [ -f /tmp/fv-backend-deploy.done ]; then
    break
  fi
  sleep 5
done

if [ ! -f /tmp/fv-backend-deploy.done ]; then
  echo "Install/syntax-check timed out after 10 minutes"
  tail -n 80 /tmp/fv-backend-deploy.log
  exit 1
fi

DEPLOY_EXIT=$(cat /tmp/fv-backend-deploy.done)
tail -n 40 /tmp/fv-backend-deploy.log
if [ "$DEPLOY_EXIT" != "0" ]; then
  echo "Install/syntax-check failed with exit code $DEPLOY_EXIT"
  exit 1
fi
echo "Install + syntax-check succeeded"

echo "Restarting Backend PM2"
pm2 restart fundsverifier-backend

pm2 save

echo "Backend Deployment Completed Successfully"
