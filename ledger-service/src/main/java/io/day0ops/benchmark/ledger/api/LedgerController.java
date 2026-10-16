package io.day0ops.benchmark.ledger.api;

import io.day0ops.benchmark.ledger.store.AccountBalanceStore;
import io.day0ops.benchmark.ledger.store.TransferResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ledger")
public class LedgerController {

    private final AccountBalanceStore balanceStore;

    public LedgerController(AccountBalanceStore balanceStore) {
        this.balanceStore = balanceStore;
    }

    @PostMapping("/entries")
    public ResponseEntity<LedgerEntryResponse> createEntry(@Valid @RequestBody LedgerEntryRequest request) {
        TransferResult result = balanceStore.transfer(request.fromAccount(), request.toAccount(), request.amount());
        LedgerEntryResponse response = new LedgerEntryResponse(
                UUID.randomUUID().toString(),
                result.fromNewBalance(),
                Instant.now());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }
}
