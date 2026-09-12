package com.um.uy.oficiosya.service.interfaces;

import org.springframework.web.multipart.MultipartFile;

public interface ProfileImageStorage {

    /** Saves a JPG or PNG image and returns the public URL it is served from. */
    String store(MultipartFile image);

    /** Removes an image previously returned by {@link #store}; any other URL is ignored. */
    void delete(String url);
}
