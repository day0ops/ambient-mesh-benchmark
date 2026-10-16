package io.day0ops.benchmark.ledger.store;

import java.math.BigDecimal;

public record TransferResult(BigDecimal fromNewBalance, BigDecimal toNewBalance) {
}
