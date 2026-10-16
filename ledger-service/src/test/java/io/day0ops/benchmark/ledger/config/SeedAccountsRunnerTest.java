package io.day0ops.benchmark.ledger.config;

import io.day0ops.benchmark.ledger.store.AccountBalanceStore;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class SeedAccountsRunnerTest {

    @Test
    void seedsConfiguredNumberOfAccountsWithStartingBalance() throws Exception {
        AccountBalanceStore store = new AccountBalanceStore();
        SeedAccountsProperties properties = new SeedAccountsProperties();
        properties.setCount(3);
        properties.setStartingBalance(new BigDecimal("500.00"));

        new SeedAccountsRunner(store, properties).run();

        assertThat(store.getBalance("acc-001")).isEqualByComparingTo("500.00");
        assertThat(store.getBalance("acc-002")).isEqualByComparingTo("500.00");
        assertThat(store.getBalance("acc-003")).isEqualByComparingTo("500.00");
    }
}
