package io.day0ops.benchmark.account.api;

import io.day0ops.benchmark.account.client.LedgerRejectedException;
import io.day0ops.benchmark.account.client.LedgerUnavailableException;
import io.day0ops.benchmark.account.service.TransferService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AccountController.class)
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TransferService transferService;

    @Test
    void createTransferReturns200OnSuccess() throws Exception {
        given(transferService.execute(any(TransferRequest.class)))
                .willReturn(new TransferResponse("t1", "COMPLETED", "e1", new BigDecimal("70.00"), Instant.parse("2026-10-16T00:00:00Z")));

        mockMvc.perform(post("/api/v1/transfers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-001","toAccount":"acc-002","amount":30.00,"currency":"USD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void createTransferReturns400OnInvalidBody() throws Exception {
        mockMvc.perform(post("/api/v1/transfers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"","toAccount":"acc-002","amount":-5,"currency":"USD"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"))
                .andExpect(jsonPath("$.details").isArray());
    }

    @Test
    void createTransferReturns503WhenLedgerUnavailable() throws Exception {
        given(transferService.execute(any(TransferRequest.class)))
                .willThrow(new LedgerUnavailableException(new RuntimeException("connection refused")));

        mockMvc.perform(post("/api/v1/transfers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-001","toAccount":"acc-002","amount":30.00,"currency":"USD"}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("ledger_unavailable"));
    }

    @Test
    void createTransferPassesThroughLedgerRejection() throws Exception {
        given(transferService.execute(any(TransferRequest.class)))
                .willThrow(new LedgerRejectedException(422, "{\"error\":\"insufficient_balance\"}"));

        mockMvc.perform(post("/api/v1/transfers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-001","toAccount":"acc-002","amount":30.00,"currency":"USD"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().json("{\"error\":\"insufficient_balance\"}"));
    }
}
