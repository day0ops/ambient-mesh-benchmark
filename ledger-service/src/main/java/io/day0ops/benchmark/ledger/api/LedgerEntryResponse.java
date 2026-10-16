package io.day0ops.benchmark.ledger.api;

import java.math.BigDecimal;
import java.time.Instant;

public record LedgerEntryResponse(String entryId, BigDecimal newBalance, Instant timestamp) {
}
