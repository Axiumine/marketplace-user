#!/bin/bash

# Fast development: node_modules on a tmpfs ramdisk.
# Needs `tmpfs /var/ram tmpfs defaults,noatime,size=4G 0 0` in /etc/fstab and a sudoers entry
# for the `mount --bind` below.
#
# ⚠️ This WIPES node_modules before mounting. Do not run it if you have local patches there.
#
# ⚠️ This repo is one of the consumers of `@axiumine/marketplace-common`. Since 2026-08-26 that package
# is published (registry.npmjs.org, 1.0.1, consumers on ^1.0.1 — ADR-037), so `yarn install` puts it back
# on its own and this script needs nothing from `BEs/marketplace-common/deploy-local.sh`. This comment
# used to say the package was on no registry and that only the deploy script could restore it; that was
# true until 2026-08-26. It still holds in one case: if common is carrying an edit no release has
# shipped, wiping node_modules loses it, and the install restores the released build instead — re-run
# the deploy script after this one, then.

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
