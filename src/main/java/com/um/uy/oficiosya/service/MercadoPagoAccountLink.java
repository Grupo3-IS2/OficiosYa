package com.um.uy.oficiosya.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.JobRequestRepository;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import com.um.uy.oficiosya.service.interfaces.EmailSenderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * A professional links the Mercado Pago account they are paid into by logging in to it (OAuth): OficiosYa reads
 * that account's email and holder name, and keeps its tokens (encrypted) to charge the professional's jobs into that
 * account, taking its commission as marketplace_fee (Split Payments 1:1).
 * https://www.mercadopago.com.uy/developers/es/docs/split-payments/landing
 */
@Service
@Slf4j
public class MercadoPagoAccountLink {

    static final String AUTHORIZATION_URL = "https://auth.mercadopago.com.uy/authorization";
    /** Mercado Pago's authorization code itself lasts 10 minutes. */
    private static final Duration STATE_TTL = Duration.ofMinutes(15);
    /** Tokens last 180 days; refreshed a day before so a checkout never starts with one about to expire. */
    private static final Duration REFRESH_BEFORE = Duration.ofDays(1);

    static final String RELINK = "El profesional tiene que volver a vincular su cuenta de Mercado Pago";

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Mercado Pago stopped accepting the tokens of this account of the professional's. */
    public record LinkLost(UUID professionalId, String mpUserId) {
    }

    private final RestClient http;
    private final ProfessionalRepository professionalRepository;
    private final JobRequestRepository jobRequestRepository;
    private final ApplicationEventPublisher events;
    private final EmailSenderService emailSender;
    private final Clock clock;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUrl;
    private final String siteUrl;
    /** Asks Mercado Pago for test tokens (TEST-...): the professional's payments then run on the sandbox, no real money. */
    private final boolean testTokens;

    @Autowired
    public MercadoPagoAccountLink(ProfessionalRepository professionalRepository, JobRequestRepository jobRequestRepository,
                                  ApplicationEventPublisher events, EmailSenderService emailSender, Clock clock,
                                  @Value("${app.payments.client-id:}") String clientId,
                                  @Value("${app.payments.client-secret:}") String clientSecret,
                                  @Value("${app.payments.oauth-redirect-url:}") String redirectUrl,
                                  @Value("${app.notifications.site-url}") String siteUrl,
                                  @Value("${app.payments.oauth-test-tokens:false}") boolean testTokens) {
        this(RestClient.builder(), professionalRepository, jobRequestRepository, events, emailSender, clock,
                clientId, clientSecret, redirectUrl, siteUrl, testTokens);
    }

    MercadoPagoAccountLink(RestClient.Builder http, ProfessionalRepository professionalRepository,
                           JobRequestRepository jobRequestRepository, ApplicationEventPublisher events,
                           EmailSenderService emailSender, Clock clock,
                           String clientId, String clientSecret, String redirectUrl, String siteUrl, boolean testTokens) {
        this.testTokens = testTokens;
        this.http = http.baseUrl(MercadoPagoGateway.API_URL).build();
        this.professionalRepository = professionalRepository;
        this.jobRequestRepository = jobRequestRepository;
        this.events = events;
        this.emailSender = emailSender;
        this.clock = clock;
        this.clientId = clientId == null ? "" : clientId.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.siteUrl = siteUrl;
        this.redirectUrl = redirectUrl == null || redirectUrl.isBlank()
                ? siteUrl + "/api/v1/payments/mercado-pago/callback" : redirectUrl.trim();
    }

    public boolean isEnabled() {
        return !clientId.isEmpty() && !clientSecret.isEmpty();
    }

    /** Where to send the professional's browser to log in to Mercado Pago and authorize OficiosYa. */
    public String authorizationUrl(UUID professionalId) {
        if (!isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "La vinculación con Mercado Pago no está disponible por el momento");
        }
        return UriComponentsBuilder.fromUriString(AUTHORIZATION_URL)
                .queryParam("client_id", clientId)
                .queryParam("response_type", "code")
                .queryParam("platform_id", "mp")
                .queryParam("state", state(professionalId))
                .queryParam("redirect_uri", redirectUrl)
                .encode().build().toUriString();
    }

    /**
     * Mercado Pago sends the browser back here with the code, or with an error if the professional didn't authorize.
     * Saves the account on the professional the state was signed for, and answers where to send the browser:
     * their profile, saying how it went.
     */
    @Transactional
    public String finish(String code, String state, String error) {
        UUID professionalId = verifiedState(state);
        if (professionalId == null) {
            log.warn("Mercado Pago link with an invalid or expired state");
            return profile("error");
        }
        if (error != null || code == null || code.isBlank()) return profile("cancelled");

        Professional professional = professionalRepository.findByPublicId(professionalId).orElse(null);
        if (professional == null) return profile("error");
        try {
            Token token = http.post().uri("/oauth/token")
                    .body(Map.of("client_id", clientId, "client_secret", clientSecret, "grant_type", "authorization_code",
                            "code", code, "redirect_uri", redirectUrl, "test_token", testTokens))
                    .retrieve().body(Token.class);
            if (token == null || token.accessToken() == null || token.refreshToken() == null) return profile("error");
            Account account = http.get().uri("/users/me")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token.accessToken())
                    .retrieve().body(Account.class);
            if (account == null || account.id() == null) return profile("error");
            String accountId = String.valueOf(account.id());
            // The same account again is how a lost link is repaired, so it is always let through
            if (jobRequestRepository.findOpenCollectors(professionalId).stream().anyMatch(open -> !open.equals(accountId))) {
                return profile("busy");
            }
            professional.setPayoutAccount(account.payoutAccount());
            professional.setPayoutMpUserId(accountId);
            keep(professional, token);
            professionalRepository.save(professional);
            log.info("Professional {} linked Mercado Pago account {}", professionalId, account.id());
            return profile("linked");
        } catch (RestClientException e) {
            log.error("Linking Mercado Pago for professional {} failed", professionalId, e);
            return profile("error");
        }
    }

    /**
     * The professional's access token, to charge into their account; null if they didn't link one.
     * Refreshes it first when it is about to expire. 502 if Mercado Pago won't: they have to link it again,
     * and if it says the grant is gone (they revoked it, or it expired) the account stops counting as linked.
     */
    @Transactional
    public String accessToken(Professional professional) {
        // Linking off: OficiosYa collects, and tokens kept from before can't be decrypted without MP_CLIENT_SECRET
        if (!isEnabled() || professional.getMpAccessToken() == null) return null;
        OffsetDateTime expiresAt = professional.getMpTokenExpiresAt();
        if (expiresAt != null && expiresAt.toInstant().isBefore(clock.instant().plus(REFRESH_BEFORE))) {
            Token token;
            try {
                token = http.post().uri("/oauth/token")
                        .body(Map.of("client_id", clientId, "client_secret", clientSecret, "grant_type", "refresh_token",
                                "refresh_token", decrypt(professional.getMpRefreshToken())))
                        .retrieve().body(Token.class);
            } catch (RestClientException e) {
                log.error("Refreshing the Mercado Pago token of professional {} failed", professional.getPublicId(), e);
                if (e instanceof HttpClientErrorException refused && refused.getResponseBodyAsString().contains("invalid_grant")) {
                    lost(professional);
                }
                token = null;
            }
            if (token == null || token.accessToken() == null || token.refreshToken() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, RELINK);
            }
            // Both are replaced: a refresh may rotate the refresh token too
            keep(professional, token);
            professionalRepository.save(professional);
        }
        return decrypt(professional.getMpAccessToken());
    }

    /**
     * After a 401 with the professional's token: asks Mercado Pago whether the token itself is dead, because a 401 can
     * also be about that one request (it refuses test sellers' refunds with "Unauthorized use of live credentials").
     */
    public boolean unlinkIfRevoked(Professional professional) {
        try {
            http.get().uri("/users/me")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + decrypt(professional.getMpAccessToken()))
                    .retrieve().toBodilessEntity();
            return false;
        } catch (HttpClientErrorException.Unauthorized _) {
            lost(professional);
            return true;
        } catch (RestClientException e) {
            log.warn("Could not check the Mercado Pago token of professional {}", professional.getPublicId(), e);
            return false;
        }
    }

    private void lost(Professional professional) {
        events.publishEvent(new LinkLost(professional.getPublicId(), professional.getPayoutMpUserId()));
    }

    /**
     * Runs after the transaction that noticed, which fails and rolls back: saved inside it, this would be lost too.
     * Only if that account is still the linked one: the professional may have linked again meanwhile.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void forgetLostLink(LinkLost event) {
        Professional professional = professionalRepository.findByPublicId(event.professionalId()).orElse(null);
        if (professional == null || event.mpUserId() == null || !event.mpUserId().equals(professional.getPayoutMpUserId())) return;
        professional.clearMercadoPagoLink();
        professionalRepository.save(professional);
        log.warn("Professional {} lost the link to Mercado Pago account {}", event.professionalId(), event.mpUserId());
        // Not subject to their notification settings: without it they silently stop being able to take jobs
        emailSender.sendNotification(professional.getEmail(), "Volvé a vincular tu cuenta de Mercado Pago", """
                Hola %s,

                Mercado Pago dejó de autorizar a OficiosYa en tu cuenta, así que no podés aceptar trabajos nuevos.
                Volvé a vincularla desde Editar perfil: %s/profile/edit

                Equipo de OficiosYa
                """.formatted(professional.getName(), siteUrl));
    }

    /** The professional stops charging into their linked account; their Mercado Pago authorization stays until they revoke it there. */
    @Transactional
    public void unlink(UUID professionalId) {
        Professional professional = professionalRepository.findByPublicId(professionalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profesional no encontrado."));
        requireNoOpenCharges(professional);
        professional.clearMercadoPagoLink();
        professionalRepository.save(professional);
    }

    /** 409 while an open job's payment needs the linked account's token, to be read or refunded. */
    public void requireNoOpenCharges(Professional professional) {
        if (!jobRequestRepository.findOpenCollectors(professional.getPublicId()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Tenés trabajos en curso cobrados en esta cuenta de Mercado Pago: terminalos o cancelalos antes de cambiarla");
        }
    }

    private void keep(Professional professional, Token token) {
        professional.setMpAccessToken(encrypt(token.accessToken()));
        professional.setMpRefreshToken(encrypt(token.refreshToken()));
        professional.setMpTokenExpiresAt(token.expiresIn() == null ? null
                : OffsetDateTime.ofInstant(clock.instant().plusSeconds(token.expiresIn()), ZoneOffset.UTC));
    }

    // shortcut: the AES key is derived from MP_CLIENT_SECRET, so rotating it makes professionals link again;
    // a separate MP_TOKEN_ENCRYPTION_KEY once that matters
    private SecretKeySpec tokenKey() {
        try {
            return new SecretKeySpec(MessageDigest.getInstance("SHA-256")
                    .digest(("oficiosya-mp-tokens:" + clientSecret).getBytes(StandardCharsets.UTF_8)), "AES");
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    /** AES-GCM, as base64 of iv + ciphertext. */
    String encrypt(String text) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, tokenKey(), new GCMParameterSpec(128, iv));
            byte[] sealed = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("AES-GCM is not available", e);
        }
    }

    String decrypt(String stored) {
        try {
            byte[] bytes = Base64.getDecoder().decode(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, tokenKey(), new GCMParameterSpec(128, bytes, 0, 12));
            return new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, RELINK);
        }
    }

    private String profile(String outcome) {
        return siteUrl + "/profile/edit?mercadopago=" + outcome;
    }

    /** "{publicId}.{expiry}.{hmac}": the callback carries no session, so it says who it is for and can't be forged. */
    String state(UUID professionalId) {
        String payload = professionalId + "." + clock.instant().plus(STATE_TTL).getEpochSecond();
        return payload + "." + sign(payload);
    }

    private UUID verifiedState(String state) {
        if (state == null) return null;
        int at = state.lastIndexOf('.');
        if (at < 0) return null;
        String payload = state.substring(0, at);
        if (!MessageDigest.isEqual(sign(payload).getBytes(StandardCharsets.UTF_8),
                state.substring(at + 1).getBytes(StandardCharsets.UTF_8))) return null;
        String[] parts = payload.split("\\.");
        try {
            if (parts.length != 2 || Long.parseLong(parts[1]) < clock.instant().getEpochSecond()) return null;
            return UUID.fromString(parts[0]);
        } catch (IllegalArgumentException _) {
            return null;
        }
    }

    private String sign(String text) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(clientSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is not available", e);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Token(@JsonProperty("access_token") String accessToken,
                 @JsonProperty("refresh_token") String refreshToken,
                 @JsonProperty("expires_in") Long expiresIn) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Account(Long id, String email, String nickname,
                   @JsonProperty("first_name") String firstName, @JsonProperty("last_name") String lastName) {

        /** Written like the ones typed in the profile: "Mercado Pago · email · holder". */
        String payoutAccount() {
            String holder = Stream.of(firstName, lastName).filter(part -> part != null && !part.isBlank())
                    .map(String::trim).collect(Collectors.joining(" "));
            String text = "Mercado Pago · " + (email == null || email.isBlank() ? nickname : email.trim())
                    + (holder.isEmpty() ? "" : " · " + holder);
            return text.length() > 200 ? text.substring(0, 200) : text;
        }
    }
}
