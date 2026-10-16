package com.um.uy.oficiosya.exception;

public class ClientAlreadyExists extends RuntimeException {
    public ClientAlreadyExists(String message) {
        super(message);
    }
}
