package com.um.uy.oficiosya.config;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts the chat's text, AES-256-GCM with a random IV per value.
 * Without{@code CHAT_ENCRYPTION_KEY} the app doesn't start.
 */
@Component
@Converter
public class ChatContentConverter implements AttributeConverter<String, String> {

    private static final String VERSION_PREFIX = "v1:";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public ChatContentConverter(@Value("${app.chat.encryption-key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            throw new IllegalStateException(
                    "CHAT_ENCRYPTION_KEY is not set; generate one with `openssl rand -base64 32`");
        }

        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("CHAT_ENCRYPTION_KEY is not valid Base64", e);
        }
        if (keyBytes.length != KEY_BYTES) {
            throw new IllegalStateException("CHAT_ENCRYPTION_KEY must be " + KEY_BYTES + " bytes (AES-256), it is "
                    + keyBytes.length);
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    @Override
    public String convertToDatabaseColumn(String plainText) {
        if (plainText == null) {
            return null;
        }

        try {
            // Never reuse an IV with the same key: GCM loses all its guarantees if it happens
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] stored = ByteBuffer.allocate(iv.length + cipherText.length).put(iv).put(cipherText).array();
            return VERSION_PREFIX + Base64.getEncoder().encodeToString(stored);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt chat content", e);
        }
    }

    /** A wrong key or a tampered value fails (GCM checks the tag) instead of returning garbage. */
    @Override
    public String convertToEntityAttribute(String stored) {
        if (stored == null) {
            return null;
        }
        if (!stored.startsWith(VERSION_PREFIX)) {
            throw new IllegalStateException("Chat content has an unknown format version");
        }

        try {
            byte[] bytes = Base64.getDecoder().decode(stored.substring(VERSION_PREFIX.length()));
            if (bytes.length < IV_BYTES) {
                throw new IllegalStateException("Chat content is too short to be valid");
            }

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES));
            byte[] plainText = cipher.doFinal(bytes, IV_BYTES, bytes.length - IV_BYTES);
            return new String(plainText, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            // Never include the content itself: not in the message, not in a log
            throw new IllegalStateException("Could not decrypt chat content", e);
        }
    }
}
