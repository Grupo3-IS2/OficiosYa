package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.UUID;

@Service
@Slf4j
public class ProfileImageStorageImpl implements ProfileImageStorage {

    static final String PUBLIC_PATH = "/uploads/profile-images/";

    static final long MAX_SIZE_BYTES = 5 * 1024 * 1024;

    private static final byte[] JPEG_SIGNATURE = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    private final Path directory;

    public ProfileImageStorageImpl(@Value("${app.uploads-dir}") String uploadsDir) {
        this.directory = Path.of(uploadsDir, "profile-images").toAbsolutePath().normalize();
    }

    @Override
    public String store(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Elegí una imagen para subir");
        }

        if (image.getSize() > MAX_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "La imagen no puede superar los 5 MB");
        }

        String fileName = UUID.randomUUID() + extensionOf(image);

        try (InputStream content = image.getInputStream()) {
            Files.createDirectories(directory);
            Files.copy(content, directory.resolve(fileName));
        } catch (IOException e) {
            log.error("Could not store profile image {}", fileName, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo guardar la imagen");
        }

        return PUBLIC_PATH + fileName;
    }

    @Override
    public void delete(String url) {
        if (url == null || !url.startsWith(PUBLIC_PATH)) {
            return;
        }

        Path file = directory.resolve(url.substring(PUBLIC_PATH.length())).normalize();

        if (!directory.equals(file.getParent())) {
            log.warn("Refusing to delete a profile image outside the uploads directory: {}", url);
            return;
        }

        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete profile image {}", file, e);
        }
    }

    private static String extensionOf(MultipartFile image) {
        byte[] header;

        try (InputStream content = image.getInputStream()) {
            header = content.readNBytes(PNG_SIGNATURE.length);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se pudo leer la imagen");
        }

        if (startsWith(header, JPEG_SIGNATURE)) {
            return ".jpg";
        }

        if (startsWith(header, PNG_SIGNATURE)) {
            return ".png";
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La imagen debe ser JPG o PNG");
    }

    private static boolean startsWith(byte[] content, byte[] signature) {
        return content.length >= signature.length
                && Arrays.equals(content, 0, signature.length, signature, 0, signature.length);
    }
}
