package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.exception.UserAlreadyExists;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final ProfileImageStorage profileImageStorage;

    public UserServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, UserMapper userMapper,
                           ProfileImageStorage profileImageStorage) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
        this.profileImageStorage = profileImageStorage;
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUser(UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));
        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public UserResponse changeEmail(EmailUpdateRequest emailRequest, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        if (!passwordEncoder.matches(emailRequest.getCurrentPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }

        String newEmail = emailRequest.getNewEmail().trim();

        if (newEmail.equals(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nuevo email es igual al actual");
        }

        if (userRepository.existsByEmail(newEmail)) {
            throw new UserAlreadyExists("Ya existe un usuario con el email " + newEmail);
        }

        user.setEmail(newEmail);
        user = userRepository.save(user);

        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public void changePassword(PasswordUpdateRequest passwordRequest, UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        if (!passwordEncoder.matches(passwordRequest.getOldPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña actual es incorrecta");
        }

        if (!passwordRequest.getNewPassword().equals(passwordRequest.getNewPasswordConfirmation())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La confirmación de la contraseña no coincide");
        }

        if (passwordEncoder.matches(passwordRequest.getNewPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La nueva contraseña es igual a la actual");
        }

        user.setPassword(passwordEncoder.encode(passwordRequest.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    @Transactional
    public UserResponse changeProfileImage(MultipartFile image, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));

        String previousImageUrl = user.getProfileImageUrl();

        user.setProfileImageUrl(profileImageStorage.store(image));
        user = userRepository.save(user);

        profileImageStorage.delete(previousImageUrl);

        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public void deleteUser(UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("Usuario no encontrado."));
        userRepository.delete(user);
    }

}
