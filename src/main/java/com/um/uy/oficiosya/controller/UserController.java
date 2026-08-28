package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.UserRequestDTO;
import com.um.uy.oficiosya.dto.response.UserResponseDTO;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    @Autowired
    private UserService userService;

    @PostMapping("/create")
    public ResponseEntity<UserResponseDTO> createUser(@RequestBody UserRequestDTO dto) {
        UserResponseDTO user = userService.createUser(dto);
        return new ResponseEntity<>(user, HttpStatus.CREATED);
    }

    @PutMapping("/{email}")
    public ResponseEntity<UserResponseDTO> updateUser(@RequestBody UserRequestDTO userRequest, @PathVariable String email) {
        UserResponseDTO userResponseDTO = userService.updateUser(userRequest, email);
        return ResponseEntity.ok(userResponseDTO);
    }

    @DeleteMapping("/{email}")
    public ResponseEntity<Void> deleteUser(@PathVariable String email) {
        userService.deleteUser(email);
        return ResponseEntity.noContent().build();
    }

}
