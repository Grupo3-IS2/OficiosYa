package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.TaskResponse;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.Task;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface JobRequestMapper {

    @Mapping(target = "clientId", source = "client.publicId")
    @Mapping(target = "professionalId", source = "professional.publicId")
    @Mapping(target = "confirmationPin", ignore = true)
    JobRequestResponse toResponse(JobRequest jobRequest);

    @Mapping(target = "tradeId", source = "trade.id")
    @Mapping(target = "tradeName", source = "trade.name")
    TaskResponse toResponse(Task task);
}
