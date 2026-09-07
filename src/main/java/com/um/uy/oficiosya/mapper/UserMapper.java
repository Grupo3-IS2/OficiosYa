package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.UserRequestDTO;
import com.um.uy.oficiosya.dto.response.UserResponseDTO;
import com.um.uy.oficiosya.entity.User;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UserMapper {

    User toEntity(UserRequestDTO dto);

    UserResponseDTO toResponse(User user);
}
