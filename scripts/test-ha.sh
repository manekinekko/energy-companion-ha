#!/bin/sh
set -eu
# Official HA 2026.9.2 multiarchitecture index, not an ARM64-only manifest.
# The test process has no network and no host HA mount.
IMAGE=ghcr.io/home-assistant/home-assistant@sha256:a1bc133af84ee6505fe2c266d9805b7c75b780dfdc188edfee3b11e8f3cd8efe
docker run --rm --network none \
  --mount "type=bind,source=$(pwd),target=/work,readonly" \
  --workdir /work --entrypoint python "$IMAGE" \
  tests/run_ha_tests.py
