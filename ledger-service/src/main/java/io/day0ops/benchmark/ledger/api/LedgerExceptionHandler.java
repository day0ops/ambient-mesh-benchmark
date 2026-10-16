package io.day0ops.benchmark.ledger.api;

import io.day0ops.benchmark.ledger.store.InsufficientBalanceException;
import io.day0ops.benchmark.ledger.store.UnknownAccountException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class LedgerExceptionHandler {

    @ExceptionHandler(UnknownAccountException.class)
    public ResponseEntity<Map<String, Object>> handleUnknownAccount(UnknownAccountException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "unknown_account");
        body.put("account", ex.getAccountId());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    @ExceptionHandler(InsufficientBalanceException.class)
    public ResponseEntity<Map<String, Object>> handleInsufficientBalance(InsufficientBalanceException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "insufficient_balance");
        body.put("fromAccount", ex.getAccountId());
        body.put("requested", ex.getRequested());
        body.put("available", ex.getAvailable());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "same_account");
        body.put("message", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "invalid_request");
        body.put("details", ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .toList());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }
}
