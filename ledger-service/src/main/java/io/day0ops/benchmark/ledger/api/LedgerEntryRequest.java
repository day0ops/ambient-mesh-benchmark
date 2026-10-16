package io.day0ops.benchmark.ledger.api;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record LedgerEntryRequest(
        @NotBlank String fromAccount,
        @NotBlank String toAccount,
        @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
        @NotBlank String currency) {
}
