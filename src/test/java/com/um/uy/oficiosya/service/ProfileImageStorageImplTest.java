package com.um.uy.oficiosya.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileImageStorageImplTest {

    @TempDir
    Path uploads;

    @Test
    void storesPngUnderTheProfileImagesDirectory() throws Exception {
        ProfileImageStorageImpl storage = new ProfileImageStorageImpl(uploads.toString());
        byte[] png = new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 1, 2};

        String url = storage.store(new MockMultipartFile("image", "avatar.png", "image/png", png));

        assertTrue(url.startsWith(ProfileImageStorageImpl.PUBLIC_PATH));
        assertTrue(url.endsWith(".png"));
        assertTrue(Files.exists(uploads.resolve("profile-images").resolve(Path.of(url).getFileName().toString())));
    }

    @Test
    void rejectsEmptyOversizedAndUnknownImages() {
        ProfileImageStorageImpl storage = new ProfileImageStorageImpl(uploads.toString());

        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> storage.store(new MockMultipartFile("image", new byte[0]))).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> storage.store(new MockMultipartFile("image", "file.txt", "text/plain", new byte[]{1, 2, 3}))).getStatusCode().value());
        assertEquals(413, assertThrows(ResponseStatusException.class,
                () -> storage.store(new MockMultipartFile("image", new byte[(int) ProfileImageStorageImpl.MAX_SIZE_BYTES + 1]))).getStatusCode().value());
    }

    @Test
    void deletesOnlyFilesInsideItsOwnDirectory() throws Exception {
        ProfileImageStorageImpl storage = new ProfileImageStorageImpl(uploads.toString());
        byte[] jpg = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1};
        String url = storage.store(new MockMultipartFile("image", "avatar.jpg", "image/jpeg", jpg));
        Path stored = uploads.resolve("profile-images").resolve(Path.of(url).getFileName().toString());

        storage.delete(url);
        assertFalse(Files.exists(stored));

        Path outside = uploads.resolve("outside.txt");
        Files.writeString(outside, "keep");
        storage.delete(ProfileImageStorageImpl.PUBLIC_PATH + "../outside.txt");
        assertTrue(Files.exists(outside));
    }
}
