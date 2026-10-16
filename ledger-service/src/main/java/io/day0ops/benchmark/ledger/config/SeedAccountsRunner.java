package io.day0ops.benchmark.ledger.config;

import io.day0ops.benchmark.ledger.store.AccountBalanceStore;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(SeedAccountsProperties.class)
public class SeedAccountsRunner implements CommandLineRunner {

    private final AccountBalanceStore balanceStore;
    private final SeedAccountsProperties properties;

    public SeedAccountsRunner(AccountBalanceStore balanceStore, SeedAccountsProperties properties) {
        this.balanceStore = balanceStore;
        this.properties = properties;
    }

    @Override
    public void run(String... args) {
        for (int i = 1; i <= properties.getCount(); i++) {
            String accountId = "acc-%03d".formatted(i);
            balanceStore.seedAccount(accountId, properties.getStartingBalance());
        }
    }
}
