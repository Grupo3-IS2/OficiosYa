package com.um.uy.oficiosya.exception;

public class JobRequestNotFoundException extends RuntimeException {
    public JobRequestNotFoundException(String message) {
        super(message);
    }
}
