package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.Task;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The emails about requests, for users who keep them on: a change of timeframe asked of them, and
 * what waits for their answer reaching the threshold. Neither is something the user is waiting for
 * at that moment, so a failure to send is only logged.
 */
@Service
@Slf4j
public class RequestNotificationService {

    private static final ZoneId URUGUAY = ZoneId.of("America/Montevideo");
    private static final Locale SPANISH = Locale.forLanguageTag("es-UY");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", SPANISH);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm", SPANISH);

    private static final String SIGNATURE = """

            Si no querés recibir estos avisos, podés desactivarlos en Editar perfil.

            Equipo de OficiosYa
            """;

    private final JobRequestRepository jobRequestRepository;
    private final ClientRepository clientRepository;
    private final EmailSenderService emailSender;
    /** How many things waiting for an answer it takes to send the "requests waiting for you" email. */
    private final int awaitingThreshold;
    /** Where the site is, for the link in the emails. */
    private final String siteUrl;

    public RequestNotificationService(JobRequestRepository jobRequestRepository,
                                      ClientRepository clientRepository,
                                      EmailSenderService emailSender,
                                      @Value("${app.notifications.awaiting-answer-threshold}") int awaitingThreshold,
                                      @Value("${app.notifications.site-url}") String siteUrl) {
        this.jobRequestRepository = jobRequestRepository;
        this.clientRepository = clientRepository;
        this.emailSender = emailSender;
        this.awaitingThreshold = awaitingThreshold;
        this.siteUrl = siteUrl.endsWith("/") ? siteUrl.substring(0, siteUrl.length() - 1) : siteUrl;
    }

    /** Tells the side that didn't ask for the reschedule that it waits for them. */
    @Transactional(readOnly = true)
    public void notifyRescheduleRequested(Long jobRequestId) {
        JobRequest job = jobRequestRepository.findById(jobRequestId).orElse(null);
        // Answered or cancelled before this ran: there is nothing to ask anymore
        if (job == null || job.getStatus() != JobStatus.RESCHEDULE_REQUESTED) return;

        boolean professionalAsked = job.getRescheduleRequestedBy() == Role.PROFESSIONAL;
        Client recipient = professionalAsked ? job.getClient() : job.getProfessional();
        Client requester = professionalAsked ? job.getProfessional() : job.getClient();
        if (!recipient.isEmailNotifications()) return;

        String current = job.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .map(schedule -> timeframe(schedule.getStartTimestamp(), schedule.getEndTimestamp()))
                .orElse("sin horario");

        String body = """
                Hola %s,

                %s pidió cambiar el horario de "%s" (%s).

                Horario actual: %s
                Horario propuesto: %s

                Entrá a Mis solicitudes para aceptarlo o rechazarlo:
                %s/mis-solicitudes
                """.formatted(recipient.getName(), requester.getName(), service(job), job.getLocation(),
                current, timeframe(job.getRescheduleStart(), job.getRescheduleEnd()), siteUrl) + SIGNATURE;

        emailSender.sendNotification(recipient.getEmail(), "Te pidieron cambiar el horario de un trabajo", body);
    }

    /**
     * Tells both sides what happened to the job, who did it and its timeframe; {@code change} null
     * means it was just proposed. Never the PIN. A reschedule asked for is left to
     * {@link #notifyRescheduleRequested}, which already tells the side that has to answer it.
     */
    @Transactional(readOnly = true)
    public void notifyJobChanged(Long jobRequestId, JobRequestEvents.Change change, UUID actorId) {
        if (change == JobRequestEvents.Change.RESCHEDULE_REQUESTED) return;
        JobRequest job = jobRequestRepository.findById(jobRequestId).orElse(null);
        if (job == null) return;

        Client actor = change == null
                ? (job.getProposedBy() == Role.PROFESSIONAL ? job.getProfessional() : job.getClient())
                : actorId == null ? null
                : job.getClient().getPublicId().equals(actorId) ? job.getClient() : job.getProfessional();
        String what = switch (change) {
            case null -> "propuso un trabajo";
            case ACCEPTED -> "aceptó el trabajo";
            case REJECTED -> "rechazó el trabajo";
            case CANCELLED -> "canceló el trabajo";
            case RESCHEDULE_ACCEPTED -> "aceptó el cambio de horario del trabajo";
            case RESCHEDULE_REJECTED -> "rechazó el cambio de horario del trabajo";
            case COMPLETED -> "marcó como completado el trabajo";
            case EXPIRED, RESCHEDULE_REQUESTED -> null;
        };
        String event = actor == null
                ? "Venció sin respuesta la propuesta de trabajo"
                : actor.getName() + " " + what;

        // The scheduled block once accepted, otherwise the timeframe the professional offered
        String when = job.getSchedules().stream()
                .filter(schedule -> schedule.getType() == ScheduleType.SCHEDULED_JOB)
                .findFirst()
                .map(schedule -> timeframe(schedule.getStartTimestamp(), schedule.getEndTimestamp()))
                .orElse(job.getProposedStart() != null
                        ? timeframe(job.getProposedStart(), job.getProposedEnd()) : "a confirmar");

        for (Client recipient : List.of(job.getClient(), job.getProfessional())) {
            if (!recipient.isEmailNotifications()) continue;
            String body = """
                    Hola %s,

                    %s "%s" (%s).

                    Horario: %s

                    Mirá el detalle en Mis solicitudes:
                    %s/mis-solicitudes
                    """.formatted(recipient.getName(), event, service(job), job.getLocation(), when, siteUrl) + SIGNATURE;
            emailSender.sendNotification(recipient.getEmail(), "Novedades de un trabajo en OficiosYa", body);
        }
    }

    /**
     * Sends the "requests waiting for you" email once what waits for the user reaches the threshold,
     * and gets ready to send it again once it drops below.
     */
    @Transactional
    public void refreshAwaitingAnswerAlert(UUID userId) {
        Client user = clientRepository.findByPublicId(userId).orElse(null);
        if (user == null) return;

        long proposals = jobRequestRepository.countProposalsAwaitingAnswerFrom(userId);
        long changes = jobRequestRepository.countReschedulesAwaitingAnswerFrom(userId);
        long total = proposals + changes;

        if (total < awaitingThreshold) {
            if (user.isAwaitingAnswerAlertSent()) {
                user.setAwaitingAnswerAlertSent(false);
                clientRepository.save(user);
            }
            return;
        }
        // Already told about this pile; and with the emails off it is not marked, so turning them on can still tell
        if (user.isAwaitingAnswerAlertSent() || !user.isEmailNotifications()) return;

        String body = """
                Hola %s,

                Tienes %d solicitudes esperando tu respuesta en OficiosYa: %s.
                Hasta que las aceptes o las rechaces, la otra parte no sabe si el trabajo sigue en pie.

                Respondelas en Mis solicitudes:
                %s/mis-solicitudes
                """.formatted(user.getName(), total, breakdown(proposals, changes), siteUrl) + SIGNATURE;

        if (emailSender.sendNotification(user.getEmail(), "Tienes %d solicitudes esperando tu respuesta".formatted(total), body)) {
            user.setAwaitingAnswerAlertSent(true);
            clientRepository.save(user);
        }
    }

    private static String breakdown(long proposals, long changes) {
        String jobs = proposals == 1 ? "1 pedido de trabajo" : proposals + " pedidos de trabajo";
        String reschedules = changes == 1 ? "1 cambio de horario" : changes + " cambios de horario";
        if (proposals == 0) return reschedules;
        if (changes == 0) return jobs;
        return jobs + " y " + reschedules;
    }

    /** "Plomería" or "Plomería y 2 tareas más", the way the job reads in Mis solicitudes. */
    private static String service(JobRequest job) {
        if (job.getTasks().isEmpty()) return "Solicitud de servicio";
        String first = job.getTasks().stream().findFirst().map(Task::getTrade).map(trade -> trade.getName()).orElse("Servicio");
        int more = job.getTasks().size() - 1;
        if (more == 0) return first;
        return first + " y " + more + (more == 1 ? " tarea más" : " tareas más");
    }

    /** "jueves 16 de octubre, de 13:30 a 15:30", in Uruguay's time. */
    static String timeframe(OffsetDateTime start, OffsetDateTime end) {
        if (start == null || end == null) return "sin horario";
        var from = start.atZoneSameInstant(URUGUAY);
        var to = end.atZoneSameInstant(URUGUAY);
        return DAY.format(from) + ", de " + TIME.format(from) + " a " + TIME.format(to);
    }
}
