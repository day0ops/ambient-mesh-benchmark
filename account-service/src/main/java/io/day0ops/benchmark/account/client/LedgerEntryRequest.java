package io.day0ops.benchmark.account.client;

import java.math.BigDecimal;

public record LedgerEntryRequest(String fromAccount, String toAccount, BigDecimal amount, String currency) {
}
