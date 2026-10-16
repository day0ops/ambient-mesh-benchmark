package io.day0ops.benchmark.ledger.store;

public class UnknownAccountException extends RuntimeException {
    private final String accountId;

    public UnknownAccountException(String accountId) {
        super("Unknown account: " + accountId);
        this.accountId = accountId;
    }

    public String getAccountId() {
        return accountId;
    }
}
