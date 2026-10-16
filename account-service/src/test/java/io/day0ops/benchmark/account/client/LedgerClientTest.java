package io.day0ops.benchmark.account.client;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class LedgerClientTest {

    @Test
    void postEntryReturnsResultOnSuccess() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ledger-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        LedgerClient client = new LedgerClient(builder.build());

        server.expect(requestTo("http://ledger-service/api/v1/ledger/entries"))
                .andExpect(method(POST))
                .andRespond(withSuccess("""
                        {"entryId":"e1","newBalance":70.00,"timestamp":"2026-10-16T00:00:00Z"}
                        """, MediaType.APPLICATION_JSON));

        LedgerEntryResult result = client.postEntry(
                new LedgerEntryRequest("acc-001", "acc-002", new BigDecimal("30.00"), "USD"));

        assertThat(result.entryId()).isEqualTo("e1");
        assertThat(result.newBalance()).isEqualByComparingTo("70.00");
        server.verify();
    }

    @Test
    void postEntryThrowsRejectedOnClientError() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ledger-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        LedgerClient client = new LedgerClient(builder.build());

        server.expect(requestTo("http://ledger-service/api/v1/ledger/entries"))
                .andRespond(withStatus(UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"error":"insufficient_balance"}
                                """));

        assertThatThrownBy(() -> client.postEntry(
                new LedgerEntryRequest("acc-001", "acc-002", new BigDecimal("30.00"), "USD")))
                .isInstanceOf(LedgerRejectedException.class)
                .hasMessageContaining("422");
    }

    @Test
    void postEntryThrowsUnavailableOnServerError() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ledger-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        LedgerClient client = new LedgerClient(builder.build());

        server.expect(requestTo("http://ledger-service/api/v1/ledger/entries"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.postEntry(
                new LedgerEntryRequest("acc-001", "acc-002", new BigDecimal("30.00"), "USD")))
                .isInstanceOf(LedgerUnavailableException.class);
    }
}
