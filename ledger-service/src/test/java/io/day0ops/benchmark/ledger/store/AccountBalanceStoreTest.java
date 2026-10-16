package io.day0ops.benchmark.ledger.store;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccountBalanceStoreTest {

    private AccountBalanceStore store;

    @BeforeEach
    void setUp() {
        store = new AccountBalanceStore();
        store.seedAccount("acc-001", new BigDecimal("100.00"));
        store.seedAccount("acc-002", new BigDecimal("50.00"));
    }

    @Test
    void transferMovesBalanceBetweenAccounts() {
        TransferResult result = store.transfer("acc-001", "acc-002", new BigDecimal("30.00"));

        assertThat(result.fromNewBalance()).isEqualByComparingTo("70.00");
        assertThat(result.toNewBalance()).isEqualByComparingTo("80.00");
        assertThat(store.getBalance("acc-001")).isEqualByComparingTo("70.00");
        assertThat(store.getBalance("acc-002")).isEqualByComparingTo("80.00");
    }

    @Test
    void transferThrowsWhenBalanceInsufficient() {
        assertThatThrownBy(() -> store.transfer("acc-002", "acc-001", new BigDecimal("1000.00")))
            .isInstanceOf(InsufficientBalanceException.class)
            .hasMessageContaining("acc-002");

        assertThat(store.getBalance("acc-002")).isEqualByComparingTo("50.00");
    }

    @Test
    void transferThrowsWhenFromAccountUnknown() {
        assertThatThrownBy(() -> store.transfer("acc-999", "acc-001", new BigDecimal("1.00")))
            .isInstanceOf(UnknownAccountException.class)
            .hasMessageContaining("acc-999");
    }

    @Test
    void transferThrowsWhenToAccountUnknown() {
        assertThatThrownBy(() -> store.transfer("acc-001", "acc-999", new BigDecimal("1.00")))
            .isInstanceOf(UnknownAccountException.class)
            .hasMessageContaining("acc-999");
    }
}
