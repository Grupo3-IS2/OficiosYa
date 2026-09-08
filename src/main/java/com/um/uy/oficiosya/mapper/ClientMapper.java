package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.entity.Client;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ClientMapper {
    Client toEntity(ClientCreateRequest dto);

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", constant = "CLIENT")
    UserResponse toResponse(Client client);
}
