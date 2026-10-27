package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.ServiceArea;
import com.um.uy.oficiosya.dto.update.AccountDeletionRequest;
import com.um.uy.oficiosya.entity.AuthProvider;
import com.um.uy.oficiosya.entity.Client;
import com.um.uy.oficiosya.entity.ExpertiseTrade;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.Schedule;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.entity.VerificationPurpose;
import com.um.uy.oficiosya.mapper.ClientMapper;
import com.um.uy.oficiosya.repository.ClientRepository;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import com.um.uy.oficiosya.service.interfaces.EmailVerificationService;
import com.um.uy.oficiosya.service.interfaces.ProfileImageStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Deleting an account wipes it instead of removing the row, so the jobs it was in keep their history. */
class ClientServiceImplAccountDeletionTest {

    @Mock
    private ClientRepository clientRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private ClientMapper clientMapper;
    @Mock
    private ProfileImageStorage profileImageStorage;
    @Mock
    private EmailVerificationService emailVerificationService;
    @Mock
    private EmailSenderService emailSenderService;
    @Mock
    private JobRequestRepository jobRequestRepository;

    private ClientServiceImpl service;
    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ClientServiceImpl(clientRepository, passwordEncoder, clientMapper, profileImageStorage,
                emailVerificationService, emailSenderService, jobRequestRepository);
        when(passwordEncoder.matches("Clave!2026", "{argon2}own")).thenReturn(true);
        when(passwordEncoder.encode(anyString())).thenReturn("{argon2}random");
    }

    private Client client(AuthProvider provider) {
        Client client = Client.builder().id(1L).publicId(id).name("Ana Pérez").email("ana@example.com")
                .password("{argon2}own").authProvider(provider).googleSubject("sub").profileImageUrl("/uploads/ana.png").build();
        when(clientRepository.findByPublicId(id)).thenReturn(Optional.of(client));
        return client;
    }

    private AccountDeletionRequest withPassword(String password) {
        return AccountDeletionRequest.builder().currentPassword(password).code("123456").build();
    }

    @Test
    void deleteUser_wipesThePersonalDataAndKeepsTheRow() {
        Client client = client(AuthProvider.LOCAL);

        service.deleteUser(withPassword("Clave!2026"), id);

        verify(clientRepository, never()).delete(any());
        verify(clientRepository).save(client);
        assertEquals(ClientServiceImpl.DELETED_NAME, client.getName());
        assertEquals("eliminada-" + id + "@oficiosya.invalid", client.getEmail());
        assertEquals("{argon2}random", client.getPassword());
        assertNull(client.getGoogleSubject());
        assertNull(client.getProfileImageUrl());
        assertFalse(client.isEmailNotifications());
        verify(profileImageStorage).delete("/uploads/ana.png");
    }

    @Test
    void deleteUser_withAWrongPassword_changesNothing() {
        Client client = client(AuthProvider.LOCAL);

        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.deleteUser(withPassword("otra"), id)).getStatusCode().value());
        assertThrows(ResponseStatusException.class, () -> service.deleteUser(new AccountDeletionRequest(), id));

        verify(clientRepository, never()).save(any());
        assertEquals("ana@example.com", client.getEmail());
    }

    @Test
    void deleteUser_ofAGoogleAccount_isConfirmedWithItsEmail() {
        Client client = client(AuthProvider.GOOGLE);

        assertThrows(ResponseStatusException.class,
                () -> service.deleteUser(AccountDeletionRequest.builder().email("otra@example.com").build(), id));
        verify(clientRepository, never()).save(any());

        service.deleteUser(AccountDeletionRequest.builder().email(" ANA@example.com ").code("123456").build(), id);
        verify(clientRepository).save(client);
    }

    @Test
    void deleteUser_withAJobStillOpen_isRefused() {
        client(AuthProvider.LOCAL);
        when(jobRequestRepository.existsForParticipantInStatus(eq(id), any())).thenReturn(true);

        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.deleteUser(withPassword("Clave!2026"), id)).getStatusCode().value());

        verify(clientRepository, never()).save(any());
        verify(profileImageStorage, never()).delete(anyString());
        // Refused before the code: its attempts are not used up.
        verify(emailVerificationService, never()).verifyCode(anyString(), any(), anyString());
    }

    @Test
    void deleteUser_checksTheCodeMailedForIt() {
        client(AuthProvider.LOCAL);

        service.deleteUser(withPassword("Clave!2026"), id);

        verify(emailVerificationService).verifyCode("ana@example.com", VerificationPurpose.ACCOUNT_DELETION, "123456");
    }

    @Test
    void deleteUser_withoutTheCodeOrWithAWrongOne_changesNothing() {
        Client client = client(AuthProvider.LOCAL);
        when(emailVerificationService.verifyCode("ana@example.com", VerificationPurpose.ACCOUNT_DELETION, "000000"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código incorrecto o vencido"));

        assertThrows(ResponseStatusException.class, () -> service.deleteUser(
                AccountDeletionRequest.builder().currentPassword("Clave!2026").build(), id));
        assertThrows(ResponseStatusException.class, () -> service.deleteUser(
                AccountDeletionRequest.builder().currentPassword("Clave!2026").code("000000").build(), id));

        verify(clientRepository, never()).save(any());
        assertEquals("ana@example.com", client.getEmail());
    }

    @Test
    void deleteUser_withAWrongPassword_doesNotTryTheCode() {
        client(AuthProvider.LOCAL);

        assertThrows(ResponseStatusException.class, () -> service.deleteUser(withPassword("otra"), id));

        verify(emailVerificationService, never()).verifyCode(anyString(), any(), anyString());
    }

    @Test
    void startAccountDeletion_mailsTheCodeToTheAccount() {
        client(AuthProvider.LOCAL);
        when(emailVerificationService.terms()).thenReturn(new EmailVerificationService.VerificationTerms(6, 900, 60));

        var pending = service.startAccountDeletion(id);

        verify(emailVerificationService).sendCode("ana@example.com", VerificationPurpose.ACCOUNT_DELETION, id, null);
        assertTrue(pending.isVerificationRequired());
    }

    @Test
    void startAccountDeletion_withAJobStillOpen_mailsNothing() {
        client(AuthProvider.LOCAL);
        when(jobRequestRepository.existsForParticipantInStatus(eq(id), any())).thenReturn(true);

        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.startAccountDeletion(id)).getStatusCode().value());

        verify(emailVerificationService, never()).sendCode(anyString(), any(), any(), any());
    }

    @Test
    void deleteUser_ofAProfessional_hidesTheProfileAndKeepsOnlyTheSlotsOfJobs() {
        Schedule free = Schedule.builder().type(ScheduleType.URGENT_AVAILABLE).build();
        Schedule job = Schedule.builder().type(ScheduleType.SCHEDULED_JOB).build();
        Professional professional = Professional.builder().id(1L).publicId(id).name("Bruno Díaz").email("bruno@example.com")
                .password("{argon2}own").authProvider(AuthProvider.LOCAL).published(true).phoneNumber("+59899123456")
                .description("Plomero").workingLocation("Cordón, Montevideo")
                .serviceArea(ServiceArea.builder().latitude(-34.9).longitude(-56.18).radiusKm(5).build())
                .expertiseTrades(new ArrayList<>(List.of(new ExpertiseTrade())))
                .schedules(new ArrayList<>(List.of(free, job))).build();
        when(clientRepository.findByPublicId(id)).thenReturn(Optional.of(professional));

        service.deleteUser(withPassword("Clave!2026"), id);

        assertFalse(professional.isPublished());
        assertEquals(ClientServiceImpl.DELETED_FIELD, professional.getPhoneNumber());
        assertEquals(ClientServiceImpl.DELETED_FIELD, professional.getWorkingLocation());
        assertNull(professional.getServiceArea());
        assertNull(professional.getDescription());
        assertTrue(professional.getExpertiseTrades().isEmpty());
        assertEquals(List.of(job), professional.getSchedules());
    }

    @Test
    void removeProfileImage_leavesNoPhotoAndDeletesTheFile() {
        Client client = client(AuthProvider.LOCAL);
        when(clientRepository.save(client)).thenReturn(client);

        service.removeProfileImage(id);

        assertNull(client.getProfileImageUrl());
        verify(profileImageStorage).delete("/uploads/ana.png");
    }
}
