#!/bin/bash

# Fast development: node_modules on a tmpfs ramdisk.
# Needs `tmpfs /var/ram tmpfs defaults,noatime,size=4G 0 0` in /etc/fstab and a sudoers entry
# for the `mount --bind` below.
#
# ⚠️ This WIPES node_modules before mounting. Do not run it if you have local patches there.
#
# ⚠️ This repo is one of the consumers of `@axiumine/marketplace-common`. That package is published
# (registry.npmjs.org, 3.0.0, consumers on ^3.0.0 — ADR-037), and since 2026-08-30 publishing is the only
# way an edit there reaches anybody (ADR-047). So wiping node_modules costs nothing: `yarn install`
# restores the exact version this repo's yarn.lock names, and there is no hand-placed build to lose.
# This comment used to say the package was on no registry and that only a local deploy script could
# restore it; that was true until 2026-08-26, and the script itself is now deleted.

mkdir -p /var/ram/marketplace-user/node_modules
rm -rf node_modules/*
sync
mkdir -p node_modules
sudo mount --bind /var/ram/marketplace-user/node_modules node_modules  # <--- add to sudoers

#load nvm
. ~/.nvm/nvm.sh
. ~/.profile
. ~/.bashrc

# Version comes from .nvmrc, so it is stated once per repo and cannot drift from
# engines.node the way a hard-coded literal here silently would.
nvm use
node --version
yarn install
yarn run dev
