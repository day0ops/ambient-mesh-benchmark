# ambient-mesh-benchmark

[![ci](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/ci.yml/badge.svg)](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/ci.yml)
[![Release](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/release.yml/badge.svg)](https://github.com/day0ops/ambient-mesh-benchmark/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Two Spring Boot services, `account-service` and `ledger-service`, used as the system under test for Solo.io's Ambient mesh benchmark. `account-service` validates an incoming transfer and calls `ledger-service` synchronously over HTTP; `ledger-service` holds in-memory account balances and applies the transfer with lock-free arithmetic. No database, queue, auth, or artificial delay - see [the design doc](https://github.com/day0ops/mesh-field-kit/blob/main/docs/superpowers/specs/2026-10-16-ambient-mesh-benchmark-apps-design.md) for the full rationale.

## Layout

```
ambient-mesh-benchmark/
├── pom.xml              # parent POM - Spring Boot BOM, Java 21
├── account-service/
└── ledger-service/
```

## Build and test

```bash
mvn -B verify
```
