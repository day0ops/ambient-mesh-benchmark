package io.day0ops.benchmark.ledger.store;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the CAS retry loop in {@link AccountBalanceStore#transfer} under real contention
 * with a real {@code ConcurrentHashMap}/{@code AtomicReference} store and real threads.
 */
class AccountBalanceStoreConcurrencyTest {

    private static final List<String> ACCOUNTS = List.of("acc-c1", "acc-c2", "acc-c3", "acc-c4");
    private static final BigDecimal STARTING_BALANCE = new BigDecimal("1000.00");
    private static final BigDecimal TRANSFER_AMOUNT = new BigDecimal("1.00");
    private static final int THREAD_COUNT = 8;
    private static final int ITERATIONS_PER_THREAD = 200;

    @Test
    void concurrentTransfersConserveTotalBalanceAndNeverGoNegative() throws InterruptedException {
        AccountBalanceStore store = new AccountBalanceStore();
        for (String account : ACCOUNTS) {
            store.seedAccount(account, STARTING_BALANCE);
        }
        BigDecimal expectedTotal = STARTING_BALANCE.multiply(BigDecimal.valueOf(ACCOUNTS.size()));

        ExecutorService executor = Executors.newFixedThreadPool(THREAD_COUNT);
        CountDownLatch latch = new CountDownLatch(THREAD_COUNT);
        try {
            for (int t = 0; t < THREAD_COUNT; t++) {
                executor.submit(() -> {
                    try {
                        ThreadLocalRandom random = ThreadLocalRandom.current();
                        for (int i = 0; i < ITERATIONS_PER_THREAD; i++) {
                            int fromIndex = random.nextInt(ACCOUNTS.size());
                            int toIndex;
                            do {
                                toIndex = random.nextInt(ACCOUNTS.size());
                            } while (toIndex == fromIndex);

                            try {
                                store.transfer(ACCOUNTS.get(fromIndex), ACCOUNTS.get(toIndex), TRANSFER_AMOUNT);
                            } catch (InsufficientBalanceException expectedUnderContention) {
                                // Expected when an account is drained by concurrent transfers; not a failure.
                            }
                        }
                    } finally {
                        latch.countDown();
                    }
                });
            }

            boolean completed = latch.await(30, TimeUnit.SECONDS);
            assertThat(completed).as("all transfer threads finished within timeout").isTrue();
        } finally {
            executor.shutdown();
        }

        BigDecimal actualTotal = ACCOUNTS.stream()
                .map(store::getBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(actualTotal).isEqualByComparingTo(expectedTotal);

        for (String account : ACCOUNTS) {
            assertThat(store.getBalance(account).signum())
                    .as("balance of %s must not be negative", account)
                    .isGreaterThanOrEqualTo(0);
        }
    }
}
