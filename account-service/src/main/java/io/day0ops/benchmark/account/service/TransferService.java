package io.day0ops.benchmark.account.service;

import io.day0ops.benchmark.account.api.TransferRequest;
import io.day0ops.benchmark.account.api.TransferResponse;
import io.day0ops.benchmark.account.client.LedgerClient;
import io.day0ops.benchmark.account.client.LedgerEntryRequest;
import io.day0ops.benchmark.account.client.LedgerEntryResult;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class TransferService {

    private final LedgerClient ledgerClient;

    public TransferService(LedgerClient ledgerClient) {
        this.ledgerClient = ledgerClient;
    }

    public TransferResponse execute(TransferRequest request) {
        LedgerEntryResult entry = ledgerClient.postEntry(new LedgerEntryRequest(
                request.fromAccount(), request.toAccount(), request.amount(), request.currency()));

        return new TransferResponse(
                UUID.randomUUID().toString(),
                "COMPLETED",
                entry.entryId(),
                entry.newBalance(),
                Instant.now());
    }
}
