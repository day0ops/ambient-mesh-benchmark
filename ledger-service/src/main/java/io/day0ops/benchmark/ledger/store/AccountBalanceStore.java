package io.day0ops.benchmark.ledger.store;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class AccountBalanceStore {

    private final ConcurrentHashMap<String, AtomicReference<BigDecimal>> balances = new ConcurrentHashMap<>();

    public void seedAccount(String accountId, BigDecimal startingBalance) {
        balances.put(accountId, new AtomicReference<>(startingBalance));
    }

    public BigDecimal getBalance(String accountId) {
        AtomicReference<BigDecimal> ref = balances.get(accountId);
        if (ref == null) {
            throw new UnknownAccountException(accountId);
        }
        return ref.get();
    }

    public TransferResult transfer(String fromAccount, String toAccount, BigDecimal amount) {
        AtomicReference<BigDecimal> fromRef = balances.get(fromAccount);
        if (fromRef == null) {
            throw new UnknownAccountException(fromAccount);
        }
        AtomicReference<BigDecimal> toRef = balances.get(toAccount);
        if (toRef == null) {
            throw new UnknownAccountException(toAccount);
        }

        BigDecimal fromNewBalance = debit(fromAccount, fromRef, amount);
        BigDecimal toNewBalance = credit(toRef, amount);
        return new TransferResult(fromNewBalance, toNewBalance);
    }

    private BigDecimal debit(String accountId, AtomicReference<BigDecimal> ref, BigDecimal amount) {
        while (true) {
            BigDecimal current = ref.get();
            BigDecimal updated = current.subtract(amount);
            if (updated.signum() < 0) {
                throw new InsufficientBalanceException(accountId, amount, current);
            }
            if (ref.compareAndSet(current, updated)) {
                return updated;
            }
        }
    }

    private BigDecimal credit(AtomicReference<BigDecimal> ref, BigDecimal amount) {
        while (true) {
            BigDecimal current = ref.get();
            BigDecimal updated = current.add(amount);
            if (ref.compareAndSet(current, updated)) {
                return updated;
            }
        }
    }
}
