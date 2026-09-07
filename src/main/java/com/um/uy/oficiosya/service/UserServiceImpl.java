package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.UserRequestDTO;
import com.um.uy.oficiosya.dto.response.UserResponseDTO;
import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.exception.UserNotFoundException;
import com.um.uy.oficiosya.mapper.UserMapper;
import com.um.uy.oficiosya.repository.UserRepository;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserServiceImpl implements UserService {
    private final UserRepository userRepository;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public UserServiceImpl(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserResponseDTO createUser(UserRequestDTO userRequest){
        if (this.userRepository.existsByEmail(userRequest.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User with email " + userRequest.getEmail() + " already exists");
        }
        
        User user = userMapper.toEntity(userRequest);
        user.setPassword(this.passwordEncoder.encode(userRequest.getPassword()));

        try {
            user = this.userRepository.save(user);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error saving the user " + e.getMessage());
        }

        return userMapper.toResponse(user);

    }

    @Override
    public UserResponseDTO updateUser(UserRequestDTO userRequest, String email){
        User user = userRepository.findByEmail(email).orElseThrow(()-> new UserNotFoundException("User not found."));
        if (userRequest.getName() != null) {
            user.setName(userRequest.getName());
        }

        if (userRequest.getEmail() != null) {
            user.setEmail(userRequest.getEmail());
        }

        if (userRequest.getPassword() != null && !userRequest.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(userRequest.getPassword()));
        }

        userRepository.save(user);
        return userMapper.toResponse(user);
    }

    @Override
    public void deleteUser(String email){
        User user =  userRepository.findByEmail(email).orElseThrow(()-> new UserNotFoundException("User not found."));
        userRepository.delete(user);
    }

}
