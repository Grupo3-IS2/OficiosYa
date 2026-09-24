package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.config.RequestRateLimiter;
import com.um.uy.oficiosya.dto.request.ResendCodeRequest;
import com.um.uy.oficiosya.dto.request.VerifyEmailRequest;
import com.um.uy.oficiosya.dto.response.PendingVerificationResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.dto.update.EmailUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleLinkUpdateRequest;
import com.um.uy.oficiosya.dto.update.GoogleUnlinkRequest;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.GoogleAuthService;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The /me endpoints for changing the email and linking Google: what the browser sends and gets back. */
class UserControllerTest {

    private static final String BASE = "/api/v1/users/me";

    @Mock
    private UserService userService;
    @Mock
    private GoogleAuthService googleAuthService;
    @Mock
    private RequestRateLimiter rateLimiter;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final Authentication authentication =
            new UsernamePasswordAuthenticationToken(userId.toString(), "n/a", List.of());

    private final PendingVerificationResponse pending = PendingVerificationResponse.builder()
            .email("nueva@example.com").message("OK").codeLength(6).expiresInSeconds(900).resendCooldownSeconds(60).build();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new UserController(userService, googleAuthService, rateLimiter))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private MockHttpServletRequestBuilder signedIn(MockHttpServletRequestBuilder request, String body) {
        return request.principal(authentication).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private UserResponse updatedUser() {
        UserResponse response = new UserResponse();
        response.setEmail("nueva@example.com");
        response.setGoogleLinked(true);
        return response;
    }

    // --- email change ---

    @Test
    void changeEmail_startsTheChangeForTheCallerAndAnswers202() throws Exception {
        when(userService.startEmailChange(any(EmailUpdateRequest.class), eq(userId))).thenReturn(pending);

        mvc.perform(signedIn(put(BASE + "/email"), """
                        {"newEmail":"nueva@example.com","currentPassword":"ClaveSegura2026!"}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value("nueva@example.com"))
                .andExpect(jsonPath("$.codeLength").value(6));

        verify(rateLimiter).check(any(), eq("email-change"));
    }

    @Test
    void changeEmail_withoutTheCurrentPassword_is400() throws Exception {
        mvc.perform(signedIn(put(BASE + "/email"), """
                        {"newEmail":"nueva@example.com"}"""))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService);
    }

    @Test
    void verifyEmailChange_answersTheUpdatedUser() throws Exception {
        when(userService.verifyEmailChange(any(VerifyEmailRequest.class), eq(userId))).thenReturn(updatedUser());

        mvc.perform(signedIn(post(BASE + "/email/verify"), """
                        {"email":"Nueva@Example.com","code":"123456"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("nueva@example.com"));

        verify(rateLimiter).check(any(), eq("email-change"));
    }

    @Test
    void resendEmailChangeCode_answers202() throws Exception {
        when(userService.resendEmailChangeCode(any(ResendCodeRequest.class), eq(userId))).thenReturn(pending);

        mvc.perform(signedIn(post(BASE + "/email/resend"), """
                        {"email":"nueva@example.com"}"""))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.resendCooldownSeconds").value(60));
    }

    @Test
    void theEmailChangeEndpoints_shareTheLimitPerClient() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Hiciste demasiados intentos"))
                .when(rateLimiter).check(any(), eq("email-change"));

        mvc.perform(signedIn(put(BASE + "/email"), """
                        {"newEmail":"nueva@example.com","currentPassword":"ClaveSegura2026!"}"""))
                .andExpect(status().isTooManyRequests());
        mvc.perform(signedIn(post(BASE + "/email/verify"), """
                        {"email":"nueva@example.com","code":"123456"}"""))
                .andExpect(status().isTooManyRequests());
        mvc.perform(signedIn(post(BASE + "/email/resend"), """
                        {"email":"nueva@example.com"}"""))
                .andExpect(status().isTooManyRequests());

        verifyNoInteractions(userService);
    }

    @Test
    void withoutASession_theCallerIsRejectedWith401() throws Exception {
        mvc.perform(post(BASE + "/email/verify").contentType(MediaType.APPLICATION_JSON).content("""
                        {"email":"nueva@example.com","code":"123456"}"""))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(userService);
    }

    // --- Google, from the profile ---

    @Test
    void linkGoogle_linksItToTheCallersAccount() throws Exception {
        when(googleAuthService.linkToUser(eq(userId), any(GoogleLinkUpdateRequest.class))).thenReturn(updatedUser());

        mvc.perform(signedIn(put(BASE + "/google"), """
                        {"credential":"id-token","currentPassword":"ClaveSegura2026!"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.googleLinked").value(true));
    }

    @Test
    void linkGoogle_withoutThePassword_is400() throws Exception {
        mvc.perform(signedIn(put(BASE + "/google"), """
                        {"credential":"id-token"}"""))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(googleAuthService);
    }

    @Test
    void unlinkGoogle_takesThePasswordInTheBody() throws Exception {
        UserResponse unlinked = updatedUser();
        unlinked.setGoogleLinked(false);
        when(googleAuthService.unlinkFromUser(eq(userId), any(GoogleUnlinkRequest.class))).thenReturn(unlinked);

        mvc.perform(signedIn(delete(BASE + "/google"), """
                        {"currentPassword":"ClaveSegura2026!"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.googleLinked").value(false));
    }
}
