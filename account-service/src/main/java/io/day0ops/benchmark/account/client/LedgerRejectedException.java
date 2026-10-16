package io.day0ops.benchmark.account.client;

public class LedgerRejectedException extends RuntimeException {
    private final int status;
    private final String body;

    public LedgerRejectedException(int status, String body) {
        super("ledger-service rejected the request with status " + status + ": " + body);
        this.status = status;
        this.body = body;
    }

    public int getStatus() { return status; }
    public String getBody() { return body; }
}
