# ambient-mesh-benchmark

[![ci](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/ci.yml/badge.svg)](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/ci.yml)
[![Release](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/release.yml/badge.svg)](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Two Spring Boot services, `account-service` and `ledger-service`, used as the system under test for Solo.io's Ambient mesh benchmark. `account-service` validates an incoming transfer and calls `ledger-service` synchronously over HTTP; `ledger-service` holds in-memory account balances and applies the transfer with lock-free arithmetic. No database, queue, auth, or artificial delay - see [the design doc](https://github.com/day0ops/mesh-field-kit/blob/main/docs/superpowers/specs/2026-10-16-ambient-mesh-benchmark-apps-design.md) for the full rationale.

## Layout

```
ambient-mesh-benchmark/
├── pom.xml              # parent POM - Spring Boot BOM, Java 21
├── account-service/     # entry point - POST /api/v1/transfers
└── ledger-service/      # in-memory ledger - POST /api/v1/ledger/entries
```

## Build and test

```bash
mvn -B verify
```

## Run locally

```bash
mvn -pl ledger-service spring-boot:run &
mvn -pl account-service spring-boot:run &

curl -X POST http://localhost:8080/api/v1/transfers \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"acc-001","toAccount":"acc-002","amount":"100.00","currency":"USD"}'
```

`ledger-service` seeds accounts `acc-001` through `acc-010` with a starting balance of `10000.00` on boot (configurable via `ledger.seed.count` / `ledger.seed.starting-balance`).

## Build and run the container images

```bash
docker build -f ledger-service/Dockerfile -t ambient-mesh-benchmark/ledger-service:local .
docker build -f account-service/Dockerfile -t ambient-mesh-benchmark/account-service:local .
```

Both images carry the OpenTelemetry Java agent, exporting traces via the standard `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` env vars - set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector when running outside this repo's own CI smoke test.

## CI/CD

`ci.yml` builds and tests every push/PR, and pushes images to `australia-southeast1-docker.pkg.dev/field-engineering-apac/kasunt` on pushes to `main`. `release.yml` is a manual, versioned release: trigger it with a `patch`/`minor`/`major` bump to tag, build, push, and publish a GitHub release with the resulting image locations.
