package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.UserCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.User;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.springframework.beans.factory.annotation.Autowired;

@Mapper(componentModel = "spring")
public abstract class UserMapper {

    @Autowired
    protected ProfessionalMapper professionalMapper;

    public abstract User toEntity(UserCreateRequest dto);

    /**
     * A user is never just a user: it is a client or a professional. The response carries
     * the shape of whichever one it is, so a professional keeps its phone number and its
     * working location instead of being flattened into the fields they share.
     */
    public UserResponse toResponse(User user) {
        if (user instanceof Professional professional) {
            return professionalMapper.toResponse(professional);
        }
        return toUserResponse(user);
    }

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", expression = "java(com.um.uy.oficiosya.entity.Role.of(user))")
    @Mapping(target = "hasPassword", expression = "java(user.getAuthProvider() == com.um.uy.oficiosya.entity.AuthProvider.LOCAL)")
    protected abstract UserResponse toUserResponse(User user);
}
