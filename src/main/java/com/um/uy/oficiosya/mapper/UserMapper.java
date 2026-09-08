package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.UserCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.User;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface UserMapper {

    User toEntity(UserCreateRequest dto);

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", expression = "java(com.um.uy.oficiosya.entity.Role.of(user))")
    UserResponse toResponse(User user);
}
