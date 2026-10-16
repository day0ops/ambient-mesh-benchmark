package io.day0ops.benchmark.account.client;

public class LedgerUnavailableException extends RuntimeException {
    public LedgerUnavailableException(Throwable cause) {
        super("ledger-service is unavailable", cause);
    }
}
