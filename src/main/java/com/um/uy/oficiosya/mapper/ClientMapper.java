package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.ClientResponse;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Client;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.springframework.beans.factory.annotation.Autowired;

@Mapper(componentModel = "spring")
public abstract class ClientMapper {

    @Autowired
    protected ProfessionalMapper professionalMapper;

    public abstract Client toEntity(ClientCreateRequest dto);

    /**
     * The response carries
     * the shape of whichever one it is, so a professional keeps its phone number and its
     * working location instead of being flattened into the fields they share.
     */
    public ClientResponse toResponse(Client user) {
        if (user instanceof Professional professional) {
            return professionalMapper.toResponse(professional);
        }
        return toClientResponse(user);
    }

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", expression = "java(com.um.uy.oficiosya.entity.Role.of(user))")
    @Mapping(target = "hasPassword", expression = "java(user.getAuthProvider() == com.um.uy.oficiosya.entity.AuthProvider.LOCAL)")
    protected abstract ClientResponse toClientResponse(Client user);
}
