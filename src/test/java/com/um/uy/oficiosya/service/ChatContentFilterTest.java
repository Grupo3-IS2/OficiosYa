package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.Conversation;
import com.um.uy.oficiosya.entity.JobRequest;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The PIN is always refused; phones and emails only until the pair has an accepted job. */
class ChatContentFilterTest {

    private final JobRequestRepository jobRequestRepository = mock(JobRequestRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final ChatContentFilter filter = new ChatContentFilter(jobRequestRepository, passwordEncoder);

    private final Conversation conversation = Conversation.builder().id(12L)
            .client(Client.builder().id(1L).build())
            .professional(Professional.builder().id(2L).build())
            .build();

    @BeforeEach
    void setUp() {
        when(passwordEncoder.matches("482913", "pin-hash")).thenReturn(true);
    }

    private void pairHas(JobStatus... statuses) {
        List<JobRequest> jobs = java.util.Arrays.stream(statuses)
                .map(status -> JobRequest.builder().status(status).confirmationPinHash("pin-hash").build())
                .toList();
        when(jobRequestRepository.findBetween(1L, 2L)).thenReturn(jobs);
    }

    private static int refusal(Runnable check) {
        return assertThrows(ResponseStatusException.class, check::run).getStatusCode().value();
    }

    @Test
    void aMessageWithoutNumbersOrEmails_doesntEvenLookUpTheJobs() {
        filter.check("Hola, ¿puedes el jueves a las 10:00?", conversation);

        verify(jobRequestRepository, never()).findBetween(anyLong(), anyLong());
    }

    @ParameterizedTest
    @ValueSource(strings = {"mi pin es 482913", "es 482 913", "4-8-2-9-1-3", "482.913"})
    void thePinOfAnAcceptedJob_isRefused_evenWithSeparators(String content) {
        pairHas(JobStatus.ACCEPTED);

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> filter.check(content, conversation));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertEquals("Nunca compartas tu PIN por el chat", e.getReason());
    }

    @Test
    void sixDigitsThatAreNotThePin_pass() {
        pairHas(JobStatus.ACCEPTED);

        assertDoesNotThrow(() -> filter.check("son $150.000 en total", conversation));
    }

    @Test
    void thePinOfAJobNoLongerActive_isNotChecked() {
        pairHas(JobStatus.COMPLETED);

        assertDoesNotThrow(() -> filter.check("482913", conversation));
        verify(passwordEncoder, never()).matches("482913", "pin-hash");
    }

    @ParameterizedTest
    @ValueSource(strings = {"llamame al 099 123 456", "+598 99 123 456", "099-123-456", "fijo 2901 2345",
            "escribime a ana.perez@gmail.com"})
    void contactDetailsWithoutAnAcceptedJob_areRefused(String content) {
        pairHas(JobStatus.PROPOSED, JobStatus.REJECTED);

        assertEquals(400, refusal(() -> filter.check(content, conversation)));
    }

    @Test
    void aHugeRunOfDigitsOrDomains_isCheckedWithoutOverflowingTheStack() {
        pairHas(JobStatus.PROPOSED);
        String digits = "1 ".repeat(100_000);
        String email = "a@b" + ".c".repeat(100_000);

        assertDoesNotThrow(() -> filter.check(digits, conversation));
        assertEquals(400, refusal(() -> filter.check(email, conversation)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ACCEPTED", "RESCHEDULE_REQUESTED", "COMPLETED"})
    void contactDetailsWithAnAcceptedJob_pass(String status) {
        pairHas(JobStatus.valueOf(status));

        assertDoesNotThrow(() -> filter.check("llamame al 099 123 456", conversation));
    }
}
