package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Refuses (never edits) a message with the PIN of one of the pair's active jobs, or with a phone
 * number or email while the pair has no accepted job. A brake, not a guarantee: "cero nueve…" passes.
 * The refused content is never logged.
 */
@Component
public class ChatContentFilter {

    /** Digits with at most one space, dot or dash between each: "099 123 456", "+598-99.123.456". */
    private static final Pattern DIGIT_RUN = Pattern.compile("\\+?\\d(?:[\\s.\\-]?\\d)*");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+");
    /** Uruguay, separators already removed: mobiles 09x xxx xxx (9x… after +598) and 8 digit landlines. */
    private static final Pattern UY_PHONE = Pattern.compile("(?:598)?(?:0?9\\d{7}|[24]\\d{7})");
    private static final int PIN_LENGTH = 6;

    private static final Set<JobStatus> PIN_ACTIVE = Set.of(JobStatus.ACCEPTED, JobStatus.RESCHEDULE_REQUESTED);
    private static final Set<JobStatus> CONTACT_ALLOWED =
            Set.of(JobStatus.ACCEPTED, JobStatus.RESCHEDULE_REQUESTED, JobStatus.COMPLETED);

    private final JobRequestRepository jobRequestRepository;
    private final PasswordEncoder passwordEncoder;

    public ChatContentFilter(JobRequestRepository jobRequestRepository, PasswordEncoder passwordEncoder) {
        this.jobRequestRepository = jobRequestRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /** Throws a 400 if the message can't be sent in that conversation. */
    public void check(String content, Conversation conversation) {
        List<String> numbers = DIGIT_RUN.matcher(content).results()
                .map(match -> match.group().replaceAll("\\D", ""))
                .toList();
        List<String> pinCandidates = numbers.stream().filter(number -> number.length() == PIN_LENGTH).toList();
        boolean hasContact = EMAIL.matcher(content).find()
                || numbers.stream().map(UY_PHONE::matcher).anyMatch(Matcher::matches);

        // Most messages have neither, and then the jobs aren't even looked up
        if (pinCandidates.isEmpty() && !hasContact) {
            return;
        }

        List<JobRequest> jobs = jobRequestRepository.findBetween(conversation.getClient().getId(),
                conversation.getProfessional().getId());

        // First the PIN, even with an accepted job: that's exactly when it matters
        boolean sharesPin = jobs.stream()
                .filter(job -> PIN_ACTIVE.contains(job.getStatus()) && job.getConfirmationPinHash() != null)
                .anyMatch(job -> pinCandidates.stream()
                        .anyMatch(candidate -> passwordEncoder.matches(candidate, job.getConfirmationPinHash())));
        if (sharesPin) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nunca compartas tu PIN por el chat");
        }

        if (hasContact && jobs.stream().noneMatch(job -> CONTACT_ALLOWED.contains(job.getStatus()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No se pueden compartir teléfonos ni mails hasta que haya un trabajo aceptado");
        }
    }
}
