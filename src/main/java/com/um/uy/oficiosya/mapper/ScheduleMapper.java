package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.entity.Schedule;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ScheduleMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "professional", ignore = true)
    @Mapping(target = "jobRequest", ignore = true)
    Schedule toEntity(ScheduleCreateRequest dto);

    @Mapping(target = "professionalId", source = "professional.publicId")
    @Mapping(target = "jobRequestId", source = "jobRequest.id")
    ScheduleResponse toResponse(Schedule schedule);
}
