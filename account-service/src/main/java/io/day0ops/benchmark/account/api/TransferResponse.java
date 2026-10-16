package io.day0ops.benchmark.account.api;

import java.math.BigDecimal;
import java.time.Instant;

public record TransferResponse(
        String transferId,
        String status,
        String ledgerEntryId,
        BigDecimal newBalance,
        Instant timestamp) {
}
