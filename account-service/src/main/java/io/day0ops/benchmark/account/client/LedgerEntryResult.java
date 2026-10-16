package io.day0ops.benchmark.account.client;

import java.math.BigDecimal;
import java.time.Instant;

public record LedgerEntryResult(String entryId, BigDecimal newBalance, Instant timestamp) {
}
