package io.day0ops.benchmark.ledger.api;

import io.day0ops.benchmark.ledger.store.AccountBalanceStore;
import io.day0ops.benchmark.ledger.store.InsufficientBalanceException;
import io.day0ops.benchmark.ledger.store.TransferResult;
import io.day0ops.benchmark.ledger.store.UnknownAccountException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(LedgerController.class)
class LedgerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AccountBalanceStore balanceStore;

    @Test
    void createEntryReturns200OnSuccess() throws Exception {
        given(balanceStore.transfer(anyString(), anyString(), any(BigDecimal.class)))
                .willReturn(new TransferResult(new BigDecimal("70.00"), new BigDecimal("80.00")));

        mockMvc.perform(post("/api/v1/ledger/entries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-001","toAccount":"acc-002","amount":30.00,"currency":"USD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.newBalance").value(70.00));
    }

    @Test
    void createEntryReturns422OnInsufficientBalance() throws Exception {
        given(balanceStore.transfer(anyString(), anyString(), any(BigDecimal.class)))
                .willThrow(new InsufficientBalanceException("acc-001", new BigDecimal("1000.00"), new BigDecimal("70.00")));

        mockMvc.perform(post("/api/v1/ledger/entries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-001","toAccount":"acc-002","amount":1000.00,"currency":"USD"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("insufficient_balance"));
    }

    @Test
    void createEntryReturns404OnUnknownAccount() throws Exception {
        given(balanceStore.transfer(anyString(), anyString(), any(BigDecimal.class)))
                .willThrow(new UnknownAccountException("acc-999"));

        mockMvc.perform(post("/api/v1/ledger/entries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"acc-999","toAccount":"acc-002","amount":1.00,"currency":"USD"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("unknown_account"));
    }

    @Test
    void createEntryReturns400OnInvalidBody() throws Exception {
        mockMvc.perform(post("/api/v1/ledger/entries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromAccount":"","toAccount":"acc-002","amount":-5,"currency":"USD"}
                                """))
                .andExpect(status().isBadRequest());
    }
}
