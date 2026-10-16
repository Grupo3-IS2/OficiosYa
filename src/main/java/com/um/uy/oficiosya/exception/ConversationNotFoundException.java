package com.um.uy.oficiosya.exception;

public class ConversationNotFoundException extends RuntimeException {
    public ConversationNotFoundException(String message) {
        super(message);
    }
}
