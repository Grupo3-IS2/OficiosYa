package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.RefreshTokenCookie;
import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.ClientCreateRequest;
import com.um.uy.oficiosya.dto.request.GoogleCredentialRequest;
import com.um.uy.oficiosya.dto.request.GoogleLinkRequest;
import com.um.uy.oficiosya.dto.request.GoogleProfessionalRegisterRequest;
import com.um.uy.oficiosya.dto.request.GoogleRegisterRequest;
import com.um.uy.oficiosya.dto.request.LoginRequest;
import com.um.uy.oficiosya.dto.request.PasswordResetRequest;
import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.LoginResponse;
import com.um.uy.oficiosya.dto.response.MessageResponse;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.entity.Role;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.AuthService;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.RegistrationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import jakarta.servlet.http.Cookie;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The auth endpoints as the browser sees them: status codes, bodies, validation and the per-client limit. */
class AuthControllerTest {

    private static final String BASE = "/api/v1/auth";

    @Mock
    private AuthService authService;
    @Mock
    private RegistrationService registrationService;
    @Mock
    private GoogleAuthService googleAuthService;
    @Mock
    private ClientService clientService;
    @Mock
    private RequestRateLimiter rateLimiter;

    private MockMvc mvc;

    private final PendingVerificationResponse pending = PendingVerificationResponse.builder()
            .email("ana@example.com").message("OK").codeLength(6).expiresInSeconds(900).resendCooldownSeconds(60).build();

    private final LoginResponse login = new LoginResponse(UUID.randomUUID(), "jwt", "ana@example.com", "Ana Perez", Role.CLIENT, "OK");

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new AuthController(authService, registrationService, googleAuthService, clientService, rateLimiter,
                        new RefreshTokenCookie(true, 7)))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        when(authService.startSession(any())).thenReturn("refresh-token");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder json(String path, String body) {
        return post(BASE + path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    // --- forgotten password ---

    @Test
    void passwordReset_startsInTheBackgroundAndAnswers202WhateverTheEmail() throws Exception {
        when(clientService.passwordResetPending("ana@example.com")).thenReturn(pending);

        mvc.perform(json("/password-reset", """
                        {"email":" Ana@Example.com "}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value("ana@example.com"))
                .andExpect(jsonPath("$.codeLength").value(6));

        verify(rateLimiter).check(any(), eq("password-reset"));
        verify(clientService).startPasswordReset("ana@example.com");
    }

    @Test
    void passwordResetConfirm_endsEverySessionAndLogsNobodyIn() throws Exception {
        UUID id = UUID.randomUUID();
        when(clientService.completePasswordReset(any(PasswordResetRequest.class))).thenReturn(id);

        mvc.perform(json("/password-reset/confirm", """
                        {"email":"ana@example.com","code":"123456","newPassword":"ClaveNueva2026!","newPasswordConfirmation":"ClaveNueva2026!"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").doesNotExist())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        verify(authService).endSessions(id);
    }

    @Test
    void passwordResetConfirm_withAWeakPassword_is400AndTouchesNothing() throws Exception {
        mvc.perform(json("/password-reset/confirm", """
                        {"email":"ana@example.com","code":"123456","newPassword":"abc","newPasswordConfirmation":"abc"}"""))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(clientService);
        verify(authService, never()).endSessions(any());
    }

    // --- registration ---

    @Test
    void registerClient_startsTheRegistrationAndAnswers202() throws Exception {
        when(registrationService.startRegistration(any(ClientCreateRequest.class))).thenReturn(pending);

        mvc.perform(json("/register-client", """
                        {"name":"Ana Perez","email":"Ana@Example.com","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value("ana@example.com"))
                .andExpect(jsonPath("$.codeLength").value(6))
                .andExpect(jsonPath("$.expiresInSeconds").value(900))
                .andExpect(jsonPath("$.resendCooldownSeconds").value(60))
                .andExpect(jsonPath("$.token").doesNotExist())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        verify(rateLimiter).check(any(), eq("registration"));
        verify(authService, never()).startSession(any());
    }

    @Test
    void registerClient_thatCompletesWithoutACode_setsTheRefreshCookieToo() throws Exception {
        PendingVerificationResponse completed = PendingVerificationResponse.builder()
                .email("ana@example.com").message("OK").session(login).build();
        when(registrationService.startRegistration(any(ClientCreateRequest.class))).thenReturn(completed);

        mvc.perform(json("/register-client", """
                        {"name":"Ana Perez","email":"ana@example.com","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isAccepted())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("oficiosya_refresh=refresh-token")));

        verify(authService).startSession(login.getId());
    }

    @Test
    void registerClient_withInvalidData_is400AndNothingStarts() throws Exception {
        mvc.perform(json("/register-client", """
                        {"name":"A","email":"not-an-email","password":"abc"}"""))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(registrationService);
    }

    @Test
    void registerProfessional_startsTheRegistrationAndAnswers202() throws Exception {
        when(registrationService.startRegistration(any(ProfessionalCreateRequest.class))).thenReturn(pending);

        mvc.perform(json("/register-professional", """
                        {"name":"Juan Gomez","email":"juan@example.com","password":"ClaveSegura2026!",
                         "phoneNumber":"099123456","workingLocation":"Montevideo"}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value("ana@example.com"));

        verify(rateLimiter).check(any(), eq("registration"));
    }

    @Test
    void verifyEmail_withTheCode_answersTheLogin() throws Exception {
        when(registrationService.verifyEmail(any(VerifyEmailRequest.class))).thenReturn(login);

        mvc.perform(json("/verify-email", """
                        {"email":"Ana@Example.com","code":"123456"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt"))
                .andExpect(jsonPath("$.role").value("CLIENT"));

        verify(rateLimiter).check(any(), eq("registration"));
    }

    @Test
    void theEmailInARequestIsTrimmedAndLowercasedBeforeItReachesTheService() throws Exception {
        when(registrationService.verifyEmail(any(VerifyEmailRequest.class))).thenReturn(login);
        when(registrationService.resendCode(any(ResendCodeRequest.class))).thenReturn(pending);
        when(authService.login(any(LoginRequest.class))).thenReturn(login);

        mvc.perform(json("/login", """
                        {"email":"  Ana@Example.COM ","password":"ClaveSegura2026!"}"""));
        mvc.perform(json("/verify-email", """
                        {"email":"  Ana@Example.COM ","code":"123456"}"""));
        mvc.perform(json("/resend-code", """
                        {"email":"  Ana@Example.COM "}"""));

        ArgumentCaptor<LoginRequest> loginRequest = ArgumentCaptor.forClass(LoginRequest.class);
        verify(authService).login(loginRequest.capture());
        assertEquals("ana@example.com", loginRequest.getValue().getEmail());
        ArgumentCaptor<VerifyEmailRequest> verify = ArgumentCaptor.forClass(VerifyEmailRequest.class);
        verify(registrationService).verifyEmail(verify.capture());
        assertEquals("ana@example.com", verify.getValue().getEmail());
        ArgumentCaptor<ResendCodeRequest> resend = ArgumentCaptor.forClass(ResendCodeRequest.class);
        verify(registrationService).resendCode(resend.capture());
        assertEquals("ana@example.com", resend.getValue().getEmail());
    }

    @Test
    void verifyEmail_withACodeThatIsNotNumeric_is400() throws Exception {
        mvc.perform(json("/verify-email", """
                        {"email":"ana@example.com","code":"abc123"}"""))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(registrationService);
    }

    @Test
    void resendCode_answers202() throws Exception {
        when(registrationService.resendCode(any(ResendCodeRequest.class))).thenReturn(pending);

        mvc.perform(json("/resend-code", """
                        {"email":"ana@example.com"}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.resendCooldownSeconds").value(60));

        verify(rateLimiter).check(any(), eq("registration"));
    }

    @Test
    void whenTheClientIsOverTheLimit_theAnswerIs429AndNothingRuns() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Hiciste demasiados intentos"))
                .when(rateLimiter).check(any(), eq("registration"));

        mvc.perform(json("/resend-code", """
                        {"email":"ana@example.com"}"""))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("Hiciste demasiados intentos"));

        verify(registrationService, never()).resendCode(any());
    }

    // --- login ---

    @Test
    void login_answersTheLoginAndSetsTheRefreshCookie() throws Exception {
        when(authService.login(any(LoginRequest.class))).thenReturn(login);

        mvc.perform(json("/login", """
                        {"email":"ana@example.com","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, allOf(
                        containsString("oficiosya_refresh=refresh-token"),
                        containsString("Path=/api/v1/auth"),
                        containsString("HttpOnly"),
                        containsString("Secure"),
                        containsString("SameSite=Strict"))));

        verify(authService).startSession(login.getId());
    }

    @Test
    void login_withWrongCredentials_startsNoSession() throws Exception {
        when(authService.login(any(LoginRequest.class)))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email o contraseña incorrectos"));

        mvc.perform(json("/login", """
                        {"email":"ana@example.com","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        verify(authService, never()).startSession(any());
    }

    @Test
    void login_pastThePerClientLimit_is429AndChecksNothing() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Hiciste demasiados intentos"))
                .when(rateLimiter).check(any(), eq("login"));

        mvc.perform(json("/login", """
                        {"email":"ana@example.com","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isTooManyRequests());

        verify(authService, never()).login(any());
    }

    // --- refresh and logout ---

    @Test
    void refresh_answersANewAccessTokenAndRotatesTheCookie() throws Exception {
        when(authService.refresh("old-refresh"))
                .thenReturn(new AuthService.RefreshedLogin(login, "new-refresh"));

        mvc.perform(post(BASE + "/refresh").cookie(new Cookie("oficiosya_refresh", "old-refresh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt"))
                .andExpect(jsonPath("$.role").value("CLIENT"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("oficiosya_refresh=new-refresh")));
    }

    @Test
    void refresh_withADeadOrMissingCookie_is401AndDropsTheCookie() throws Exception {
        when(authService.refresh(isNull()))
                .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La sesión expiró"));

        mvc.perform(post(BASE + "/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("La sesión expiró"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, allOf(
                        containsString("oficiosya_refresh="),
                        containsString("Max-Age=0"))));
    }

    @Test
    void logout_passesTheRefreshCookieAndDropsIt() throws Exception {
        when(authService.logout(any(), eq("refresh-token"))).thenReturn(new MessageResponse("Sesión cerrada correctamente"));

        mvc.perform(post(BASE + "/logout").cookie(new Cookie("oficiosya_refresh", "refresh-token")))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));

        verify(authService).logout(any(), eq("refresh-token"));
    }

    // --- Google ---

    @Test
    void googleLogin_answersTheLoginAndUsesItsOwnLimit() throws Exception {
        when(googleAuthService.login(any(GoogleCredentialRequest.class))).thenReturn(login);

        mvc.perform(json("/google/login", """
                        {"credential":"id-token"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("oficiosya_refresh=refresh-token")));

        verify(rateLimiter).check(any(), eq("google"));
    }

    @Test
    void googleLogin_withoutACredential_is400() throws Exception {
        mvc.perform(json("/google/login", "{}")).andExpect(status().isBadRequest());

        verifyNoInteractions(googleAuthService);
    }

    @Test
    void googleLink_needsThePasswordToo() throws Exception {
        when(googleAuthService.link(any(GoogleLinkRequest.class))).thenReturn(login);

        mvc.perform(json("/google/link", """
                        {"credential":"id-token","password":"ClaveSegura2026!"}"""))
                .andExpect(status().isOk());
        mvc.perform(json("/google/link", """
                        {"credential":"id-token"}"""))
                .andExpect(status().isBadRequest());

        verify(googleAuthService).link(any(GoogleLinkRequest.class));
        verify(rateLimiter).check(any(), eq("google"));
    }

    @Test
    void googleRegisterClient_answersTheLogin() throws Exception {
        when(googleAuthService.registerClient(any(GoogleRegisterRequest.class))).thenReturn(login);

        mvc.perform(json("/google/register-client", """
                        {"credential":"id-token"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ana@example.com"));
    }

    @Test
    void googleRegisterClient_acceptsANameButOnlyAFullOne() throws Exception {
        when(googleAuthService.registerClient(any(GoogleRegisterRequest.class))).thenReturn(login);

        mvc.perform(json("/google/register-client", """
                        {"credential":"id-token","name":"Ana Pérez"}"""))
                .andExpect(status().isOk());
        mvc.perform(json("/google/register-client", """
                        {"credential":"id-token","name":"Ana"}"""))
                .andExpect(status().isBadRequest());

        verify(googleAuthService).registerClient(argThat(request -> "Ana Pérez".equals(request.getName())));
    }

    @Test
    void googleRegisterProfessional_needsPhoneAndLocation() throws Exception {
        when(googleAuthService.registerProfessional(any(GoogleProfessionalRegisterRequest.class))).thenReturn(login);

        mvc.perform(json("/google/register-professional", """
                        {"credential":"id-token","phoneNumber":"099123456","workingLocation":"Salto"}"""))
                .andExpect(status().isOk());
        mvc.perform(json("/google/register-professional", """
                        {"credential":"id-token"}"""))
                .andExpect(status().isBadRequest());

        verify(googleAuthService).registerProfessional(any(GoogleProfessionalRegisterRequest.class));
    }

    @Test
    void googleEndpoints_shareTheLimitPerClient() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Hiciste demasiados intentos"))
                .when(rateLimiter).check(any(), eq("google"));

        mvc.perform(json("/google/login", """
                        {"credential":"id-token"}""")).andExpect(status().isTooManyRequests());
        mvc.perform(json("/google/link", """
                        {"credential":"id-token","password":"ClaveSegura2026!"}""")).andExpect(status().isTooManyRequests());

        verifyNoInteractions(googleAuthService);
    }
}
