package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.PasswordUpdateRequest;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.exception.UserAlreadyExists;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;

    public UserServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder, UserMapper userMapper) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUser(UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("User not found."));
        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public UserResponse changeEmail(EmailUpdateRequest emailRequest, UUID id) {
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("User not found."));

        String newEmail = emailRequest.getNewEmail();

        if (!newEmail.equals(user.getEmail())) {
            if (userRepository.existsByEmail(newEmail)) {
                throw new UserAlreadyExists("User with email " + newEmail + " already exists");
            }
            user.setEmail(newEmail);
            user = userRepository.save(user);
        }

        return userMapper.toResponse(user);
    }

    @Override
    @Transactional
    public void changePassword(PasswordUpdateRequest passwordRequest, UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("User not found."));

        if (!passwordEncoder.matches(passwordRequest.getOldPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }

        user.setPassword(passwordEncoder.encode(passwordRequest.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void deleteUser(UUID id){
        User user = userRepository.findByPublicId(id).orElseThrow(() -> new UserNotFoundException("User not found."));
        userRepository.delete(user);
    }

}
