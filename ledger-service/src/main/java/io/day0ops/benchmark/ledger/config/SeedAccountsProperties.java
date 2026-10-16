package io.day0ops.benchmark.ledger.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@ConfigurationProperties(prefix = "ledger.seed")
public class SeedAccountsProperties {

    private int count = 10;
    private BigDecimal startingBalance = new BigDecimal("10000.00");

    public int getCount() { return count; }
    public void setCount(int count) { this.count = count; }
    public BigDecimal getStartingBalance() { return startingBalance; }
    public void setStartingBalance(BigDecimal startingBalance) { this.startingBalance = startingBalance; }
}
