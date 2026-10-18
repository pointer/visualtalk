# syntax=docker/dockerfile:1
#
# Local, self-hosted LiveKit server image for VisualTalk development.
#
# Default build = the official upstream release binary re-packed into a minimal,
# non-root Alpine runtime with VisualTalk's local config baked in. Nothing is
# compiled, so `docker build` needs no Go toolchain and finishes in seconds.
#
# To rebuild the very same version from source instead (audit / patch / verify
# the binary), select the source stage:
#
#   docker build --build-arg BINARY_STAGE=build-from-source \
#     -t visualtalk/livekit-server:v1.13.10-local docker
#
# Run it standalone (docker/docker-compose.yml does all of this for you):
#
#   docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
#     -e LIVEKIT_KEYS='devkey: <secret of at least 32 characters>' \
#     visualtalk/livekit-server:v1.13.10-local
#
# The tag above is the one docker-compose.yml computes:
# visualtalk/livekit-server:${LIVEKIT_VERSION}-local. Bump LIVEKIT_VERSION
# (docker/.env) and both the tag and the binaries below move together.
#
# livekit-server refuses to start without an API key pair on purpose: this image
# ships no credentials, so a misconfigured container fails loudly instead of
# serving media under a well-known dev secret.

# Single version knob: it selects the source tag to clone, the upstream release
# image, the OCI version label and (through docker-compose.yml) the local tag.
ARG LIVEKIT_VERSION=v1.13.10
ARG GO_IMAGE=golang:1.26-alpine
# Derived from LIVEKIT_VERSION on purpose - a second hard-coded version here
# would let the release binary and the source build drift apart.
ARG UPSTREAM_IMAGE=livekit/livekit-server:${LIVEKIT_VERSION}
ARG RUNTIME_IMAGE=alpine:3.24
# Which stage supplies /livekit-server: `upstream-image` (default) or
# `build-from-source`.
ARG BINARY_STAGE=upstream-image

# ── stage 1: build livekit-server from source (only used when selected) ──────
FROM ${GO_IMAGE} AS build-from-source
ARG LIVEKIT_VERSION
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "${LIVEKIT_VERSION}" \
      https://github.com/livekit/livekit.git . \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
      -o /livekit-server ./cmd/server \
 && /livekit-server --version

# ── stage 2: official release binary (default) ───────────────────────────────
FROM ${UPSTREAM_IMAGE} AS upstream-image

# ── stage 3: pick one of the two above ───────────────────────────────────────
FROM ${BINARY_STAGE} AS binary

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${RUNTIME_IMAGE} AS runtime
ARG LIVEKIT_VERSION
ARG BINARY_STAGE

LABEL org.opencontainers.image.title="livekit-server (VisualTalk local dev)" \
      org.opencontainers.image.description="Self-hosted LiveKit signalling + media server for local VisualTalk development" \
      org.opencontainers.image.version="${LIVEKIT_VERSION}" \
      org.opencontainers.image.source="https://github.com/livekit/livekit" \
      org.opencontainers.image.licenses="Apache-2.0" \
      dev.visualtalk.binary-stage="${BINARY_STAGE}"

# ca-certificates: outbound TLS (webhooks, TURN over TLS).
# wget (busybox): used by HEALTHCHECK below.
RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 livekit \
 && adduser -S -u 10001 -G livekit -H -h /home/livekit livekit

COPY --from=binary --chmod=0755 /livekit-server /usr/local/bin/livekit-server
COPY --chmod=0444 livekit.yaml /etc/livekit.yaml

# Defaults for a loopback-only server behind Docker bridge networking.
# NODE_IP / UDP_PORT are read straight from the environment by livekit-server
# (they are env sources of the --node-ip / --udp-port flags). All three are
# overridden by docker/docker-compose.yml from docker/.env.
#
# NODE_IP=127.0.0.1 is required: with bridge networking the container's own
# eth0 address (172.x.x.x) is unreachable from the host, and a client handed
# that address as an ICE candidate stalls on "connecting". Left unset,
# livekit-server auto-detects an interface and picks the container IP.
ENV NODE_IP=127.0.0.1 \
    UDP_PORT=7882 \
    LIVEKIT_LOGGING_LEVEL=info

# Non-root: every port below is > 1024, so no privilege is needed.
USER livekit

# 7880 = HTTP API + WebSocket signalling, 7881 = ICE/TCP fallback,
# 7882 = ICE/UDP (single muxed port; see docker/livekit.yaml for why not a range)
EXPOSE 7880/tcp 7881/tcp 7882/udp

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:7880/ || exit 1

ENTRYPOINT ["/usr/local/bin/livekit-server"]
CMD ["--config", "/etc/livekit.yaml"]
