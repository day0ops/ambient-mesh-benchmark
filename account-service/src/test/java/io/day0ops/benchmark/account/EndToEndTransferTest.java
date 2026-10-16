package io.day0ops.benchmark.account;

import io.day0ops.benchmark.ledger.LedgerServiceApplication;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.context.ServerPortInfoApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT)
class EndToEndTransferTest {

    private static ConfigurableApplicationContext ledgerContext;

    @DynamicPropertySource
    static void ledgerServiceProperties(DynamicPropertyRegistry registry) {
        ledgerContext = new SpringApplicationBuilder(LedgerServiceApplication.class)
                .initializers(new ServerPortInfoApplicationContextInitializer())
                .properties(
                        "server.port=0",
                        "ledger.seed.count=3",
                        "ledger.seed.starting-balance=1000.00")
                // Both services ship application.yml at the same classpath location, and this JVM's
                // classpath merges both; a plain classpath:/application.yml lookup resolves to
                // account-service's file (server.port=8080), outranking the low-priority default
                // above. Pass server.port as a command-line arg so it outranks application.yml.
                .run("--server.port=0");
        String ledgerPort = ledgerContext.getEnvironment().getProperty("local.server.port");
        registry.add("ledger.service.base-url", () -> "http://localhost:" + ledgerPort);
    }

    @AfterAll
    static void stopLedgerService() {
        ledgerContext.close();
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void transferMovesMoneyThroughRealLedgerService() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> request = new HttpEntity<>("""
                {"fromAccount":"acc-001","toAccount":"acc-002","amount":"100.00","currency":"USD"}
                """, headers);

        ResponseEntity<String> response = restTemplate.postForEntity("/api/v1/transfers", request, String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).contains("\"status\":\"COMPLETED\"");
        assertThat(response.getBody()).contains("\"newBalance\":900.00");
    }
}
