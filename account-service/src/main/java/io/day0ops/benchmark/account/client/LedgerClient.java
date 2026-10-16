package io.day0ops.benchmark.account.client;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class LedgerClient {

    private final RestClient restClient;

    public LedgerClient(RestClient restClient) {
        this.restClient = restClient;
    }

    public LedgerEntryResult postEntry(LedgerEntryRequest request) {
        try {
            return restClient.post()
                    .uri("/api/v1/ledger/entries")
                    .body(request)
                    .retrieve()
                    .body(LedgerEntryResult.class);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                throw new LedgerUnavailableException(ex);
            }
            throw new LedgerRejectedException(ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (RestClientException ex) {
            throw new LedgerUnavailableException(ex);
        }
    }
}
