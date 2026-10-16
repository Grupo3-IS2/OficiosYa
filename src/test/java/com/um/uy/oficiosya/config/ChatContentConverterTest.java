package com.um.uy.oficiosya.config;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatContentConverterTest {

    private static String key(int bytes, int seed) {
        byte[] key = new byte[bytes];
        for (int i = 0; i < bytes; i++) {
            key[i] = (byte) (i + seed);
        }
        return Base64.getEncoder().encodeToString(key);
    }

    private final ChatContentConverter converter = new ChatContentConverter(key(32, 0));

    @Test
    void encryptsAndDecryptsBackToTheSameText() {
        for (String text : new String[]{"Hola", "¿Puedes el jueves? Ñandú, acción 😀🛠️", "a".repeat(2000)}) {
            String stored = converter.convertToDatabaseColumn(text);

            assertTrue(stored.startsWith("v1:"));
            assertFalse(stored.contains(text));
            assertEquals(text, converter.convertToEntityAttribute(stored));
        }
    }

    @Test
    void theSameTextEncryptsDifferentlyEachTime() {
        assertNotEquals(converter.convertToDatabaseColumn("Hola"), converter.convertToDatabaseColumn("Hola"));
    }

    @Test
    void nullStaysNull() {
        assertNull(converter.convertToDatabaseColumn(null));
        assertNull(converter.convertToEntityAttribute(null));
    }

    @Test
    void aTamperedValueFailsInsteadOfReturningGarbage() {
        String stored = converter.convertToDatabaseColumn("Hola, ¿cómo va?");
        byte[] bytes = Base64.getDecoder().decode(stored.substring(3));
        bytes[bytes.length - 1] ^= 1;
        String tampered = "v1:" + Base64.getEncoder().encodeToString(bytes);

        assertThrows(IllegalStateException.class, () -> converter.convertToEntityAttribute(tampered));
    }

    @Test
    void anotherKeyCantDecryptIt() {
        String stored = converter.convertToDatabaseColumn("Hola");
        ChatContentConverter other = new ChatContentConverter(key(32, 1));

        assertThrows(IllegalStateException.class, () -> other.convertToEntityAttribute(stored));
    }

    @Test
    void anUnknownFormatOrNotBase64Fails() {
        assertThrows(IllegalStateException.class, () -> converter.convertToEntityAttribute("Hola en claro"));
        assertThrows(IllegalStateException.class, () -> converter.convertToEntityAttribute("v1:@@@"));
        assertThrows(IllegalStateException.class, () -> converter.convertToEntityAttribute("v1:AAAA"));
    }

    @Test
    void cantBeCreatedWithoutAValid32ByteKey() {
        assertThrows(IllegalStateException.class, () -> new ChatContentConverter(null));
        assertThrows(IllegalStateException.class, () -> new ChatContentConverter(""));
        assertThrows(IllegalStateException.class, () -> new ChatContentConverter("   "));
        assertThrows(IllegalStateException.class, () -> new ChatContentConverter("not base64!"));
        String tooShort = key(16, 0);
        assertThrows(IllegalStateException.class, () -> new ChatContentConverter(tooShort));
    }
}
