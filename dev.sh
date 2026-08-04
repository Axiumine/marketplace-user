#!/bin/bash

# Fast development: node_modules on a tmpfs ramdisk.
# Needs `tmpfs /var/ram tmpfs defaults,noatime,size=4G 0 0` in /etc/fstab and a sudoers entry
# for the `mount --bind` below.
#
# ⚠️ This WIPES node_modules before mounting. Do not run it if you have local patches there.
#
# ⚠️ This repo is one of the consumers of `@thedoctorweb_agency/marketplace-common`, which is NOT on
# any registry — the services resolve it from a copy placed in node_modules by
# `BEs/marketplace-common/deploy-local.sh`. Wiping node_modules therefore wipes that copy too, and
# `yarn install` cannot put it back. Re-run the deploy script after this one if the install fails to
# resolve it.

mkdir -p /var/ram/marketplace-user/node_modules
rm -rf node_modules/*
sync
mkdir -p node_modules
sudo mount --bind /var/ram/marketplace-user/node_modules node_modules  # <--- add to sudoers

#load nvm
. ~/.nvm/nvm.sh
. ~/.profile
. ~/.bashrc

nvm use v24.18.0
node --version
yarn install
yarn run dev
