package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.TaskResponse;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Task;
import org.mapstruct.AfterMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

@Mapper(componentModel = "spring")
public interface JobRequestMapper {

    @Mapping(target = "clientId", source = "client.publicId")
    @Mapping(target = "clientName", source = "client.name")
    @Mapping(target = "clientProfileImageUrl", source = "client.profileImageUrl")
    @Mapping(target = "professionalId", source = "professional.publicId")
    @Mapping(target = "professionalName", source = "professional.name")
    @Mapping(target = "professionalProfileImageUrl", source = "professional.profileImageUrl")
    @Mapping(target = "clientEmail", ignore = true)
    @Mapping(target = "professionalPhoneNumber", ignore = true)
    @Mapping(target = "confirmationPin", ignore = true)
    @Mapping(target = "scheduledStart", ignore = true)
    @Mapping(target = "scheduledEnd", ignore = true)
    JobRequestResponse toResponse(JobRequest jobRequest);

    @Mapping(target = "tradeId", source = "trade.id")
    @Mapping(target = "tradeName", source = "trade.name")
    TaskResponse toResponse(Task task);

    /** The agreed timeframe lives in the SCHEDULED_JOB block created when the job was accepted. */
    @AfterMapping
    default void addScheduledTimeframe(JobRequest jobRequest, @MappingTarget JobRequestResponse response) {
        jobRequest.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .ifPresent(schedule -> {
                    response.setScheduledStart(schedule.getStartTimestamp());
                    response.setScheduledEnd(schedule.getEndTimestamp());
                });
    }

    @AfterMapping
    default void addContactDetails(JobRequest jobRequest, @MappingTarget JobRequestResponse response) {
        if (isContactVisible(jobRequest.getStatus())) {
            response.setClientEmail(jobRequest.getClient().getEmail());
            response.setProfessionalPhoneNumber(jobRequest.getProfessional().getPhoneNumber());
        }
    }

    /** Statuses in which both sides have committed to the job, so each can see how to reach the other. */
    private static boolean isContactVisible(JobStatus status) {
        return status == JobStatus.ACCEPTED
                || status == JobStatus.RESCHEDULE_REQUESTED
                || status == JobStatus.COMPLETED;
    }
}
