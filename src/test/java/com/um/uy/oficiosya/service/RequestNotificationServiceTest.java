package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Task;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Who gets which request email, what it says, and the reminder being sent once per pile. */
class RequestNotificationServiceTest {

    @Mock
    private JobRequestRepository jobRequestRepository;
    @Mock
    private ClientRepository clientRepository;
    @Mock
    private EmailSenderService emailSender;

    private RequestNotificationService service;

    private Client client;
    private Professional professional;

    /** 16 Oct 2026, 13:30 in Uruguay (UTC-3). */
    private static final OffsetDateTime CURRENT = OffsetDateTime.of(2026, 10, 16, 16, 30, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime PROPOSED = OffsetDateTime.of(2026, 10, 18, 13, 0, 0, 0, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new RequestNotificationService(jobRequestRepository, clientRepository, emailSender, 3, "https://oficiosya.test/");
        client = Client.builder().publicId(UUID.randomUUID()).name("Carla").email("carla@example.com").build();
        professional = Professional.builder().publicId(UUID.randomUUID()).name("Pablo").email("pablo@example.com").build();
        when(emailSender.sendNotification(anyString(), anyString(), anyString())).thenReturn(true);
    }

    private JobRequest pendingReschedule(Role requestedBy) {
        JobRequest job = JobRequest.builder().id(10L).client(client).professional(professional)
                .location("Av. Italia 1234").paymentAmount(BigDecimal.TEN).confirmationPinHash("hash")
                .status(JobStatus.RESCHEDULE_REQUESTED).rescheduleRequestedBy(requestedBy)
                .rescheduleStart(PROPOSED).rescheduleEnd(PROPOSED.plusHours(2)).build();
        job.getTasks().add(Task.builder().trade(Trade.builder().id(1L).name("Plomería").build()).description("Canilla").build());
        job.getSchedules().add(Schedule.builder().type(ScheduleType.SCHEDULED_JOB)
                .startTimestamp(CURRENT).endTimestamp(CURRENT.plusHours(2)).build());
        when(jobRequestRepository.findById(10L)).thenReturn(Optional.of(job));
        return job;
    }

    // --- reschedule ---

    @Test
    void aRescheduleTheProfessionalAsked_isMailedToTheClient_withBothTimeframes() {
        pendingReschedule(Role.PROFESSIONAL);

        service.notifyRescheduleRequested(10L);

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendNotification(eq("carla@example.com"), eq("Te pidieron cambiar el horario de un trabajo"), body.capture());
        assertTrue(body.getValue().contains("Hola Carla,"));
        assertTrue(body.getValue().contains("Pablo pidió cambiar el horario de \"Plomería\" (Av. Italia 1234)."));
        assertTrue(body.getValue().contains("Horario actual: viernes 16 de octubre, de 13:30 a 15:30"));
        assertTrue(body.getValue().contains("Horario propuesto: domingo 18 de octubre, de 10:00 a 12:00"));
        assertTrue(body.getValue().contains("https://oficiosya.test/mis-solicitudes"));
        assertTrue(body.getValue().contains("desactivarlos en Editar perfil"));
    }

    @Test
    void aRescheduleTheClientAsked_isMailedToTheProfessional() {
        pendingReschedule(Role.CLIENT);

        service.notifyRescheduleRequested(10L);

        verify(emailSender).sendNotification(eq("pablo@example.com"), anyString(), anyString());
    }

    @Test
    void someoneWithTheEmailsOff_isNotMailed() {
        client.setEmailNotifications(false);
        pendingReschedule(Role.PROFESSIONAL);

        service.notifyRescheduleRequested(10L);

        verify(emailSender, never()).sendNotification(anyString(), anyString(), anyString());
    }

    @Test
    void aRescheduleAlreadyAnsweredWhenTheEmailGoesOut_isNotMailed() {
        pendingReschedule(Role.PROFESSIONAL).setStatus(JobStatus.ACCEPTED);

        service.notifyRescheduleRequested(10L);

        verify(emailSender, never()).sendNotification(anyString(), anyString(), anyString());
    }

    // --- requests waiting for an answer ---

    private void awaiting(Client user, long proposals, long changes) {
        when(clientRepository.findByPublicId(user.getPublicId())).thenReturn(Optional.of(user));
        when(jobRequestRepository.countProposalsAwaitingAnswerFrom(user.getPublicId())).thenReturn(proposals);
        when(jobRequestRepository.countReschedulesAwaitingAnswerFrom(user.getPublicId())).thenReturn(changes);
    }

    @Test
    void reachingTheThreshold_mailsWhatWaits_once() {
        awaiting(professional, 2, 1);

        service.refreshAwaitingAnswerAlert(professional.getPublicId());

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendNotification(eq("pablo@example.com"), eq("Tienes 3 solicitudes esperando tu respuesta"), body.capture());
        assertTrue(body.getValue().contains("Tienes 3 solicitudes esperando tu respuesta en OficiosYa: 2 pedidos de trabajo y 1 cambio de horario."));
        assertTrue(professional.isAwaitingAnswerAlertSent());

        // A fourth one doesn't send it again
        awaiting(professional, 3, 1);
        service.refreshAwaitingAnswerAlert(professional.getPublicId());
        verify(emailSender).sendNotification(anyString(), anyString(), anyString());
    }

    @Test
    void belowTheThreshold_nothingIsMailed() {
        awaiting(professional, 2, 0);

        service.refreshAwaitingAnswerAlert(professional.getPublicId());

        verify(emailSender, never()).sendNotification(anyString(), anyString(), anyString());
        assertFalse(professional.isAwaitingAnswerAlertSent());
    }

    @Test
    void droppingBelowTheThreshold_letsTheNextPileBeMailed() {
        professional.setAwaitingAnswerAlertSent(true);
        awaiting(professional, 1, 0);

        service.refreshAwaitingAnswerAlert(professional.getPublicId());

        assertFalse(professional.isAwaitingAnswerAlertSent());
        verify(clientRepository).save(professional);

        awaiting(professional, 3, 0);
        service.refreshAwaitingAnswerAlert(professional.getPublicId());
        verify(emailSender).sendNotification(eq("pablo@example.com"), eq("Tienes 3 solicitudes esperando tu respuesta"), anyString());
    }

    @Test
    void withTheEmailsOff_thePileIsNotMailedNorMarked_soTurningThemOnCanStillTell() {
        professional.setEmailNotifications(false);
        awaiting(professional, 5, 0);

        service.refreshAwaitingAnswerAlert(professional.getPublicId());

        verify(emailSender, never()).sendNotification(anyString(), anyString(), anyString());
        assertFalse(professional.isAwaitingAnswerAlertSent());
    }

    @Test
    void aFailedEmail_isNotMarkedAsSent_soTheNextChangeTriesAgain() {
        when(emailSender.sendNotification(anyString(), anyString(), anyString())).thenReturn(false);
        awaiting(professional, 3, 0);

        service.refreshAwaitingAnswerAlert(professional.getPublicId());

        assertFalse(professional.isAwaitingAnswerAlertSent());
        verify(clientRepository, never()).save(any());
    }

    @Test
    void onlyChangesOfTimeframe_areCountedForAClientToo() {
        awaiting(client, 0, 3);

        service.refreshAwaitingAnswerAlert(client.getPublicId());

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendNotification(eq("carla@example.com"), anyString(), body.capture());
        assertTrue(body.getValue().contains(": 3 cambios de horario."));
    }

    @Test
    void timeframes_readInUruguaysTime() {
        assertEquals("viernes 16 de octubre, de 13:30 a 15:30", RequestNotificationService.timeframe(CURRENT, CURRENT.plusHours(2)));
        assertEquals("sin horario", RequestNotificationService.timeframe(null, null));
    }
}
