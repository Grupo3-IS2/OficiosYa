package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.repository.ProfessionalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MercadoPagoAccountLinkTest {

    private static final Instant NOW = Instant.parse("2026-11-03T12:00:00Z");
    private static final String SITE = "https://dev.oficiosya.uy";
    private static final String CALLBACK = SITE + "/api/v1/payments/mercado-pago/callback";

    private final UUID professionalId = UUID.randomUUID();
    private final ProfessionalRepository professionalRepository = mock(ProfessionalRepository.class);
    private final Professional professional = Professional.builder().publicId(professionalId).name("Ana").build();
    private RestClient.Builder builder;
    private MockRestServiceServer mp;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        mp = MockRestServiceServer.bindTo(builder).build();
        when(professionalRepository.findByPublicId(professionalId)).thenReturn(Optional.of(professional));
    }

    private MercadoPagoAccountLink link(Instant now) {
        return new MercadoPagoAccountLink(builder, professionalRepository, Clock.fixed(now, ZoneOffset.UTC),
                "1234", "secret", "", SITE, false);
    }

    private static String stateOf(String authorizationUrl) {
        return UriComponentsBuilder.fromUriString(authorizationUrl).build(true).getQueryParams().getFirst("state")
                .replace("%2E", ".");
    }

    @Test
    void theAuthorizationUrl_isMercadoPagosWithTheAppAndTheCallback() {
        String url = link(NOW).authorizationUrl(professionalId);

        assertTrue(url.startsWith(MercadoPagoAccountLink.AUTHORIZATION_URL + "?client_id=1234&response_type=code&platform_id=mp"));
        assertTrue(url.contains("redirect_uri=" + CALLBACK.replace(":", "%3A").replace("/", "%2F"))
                || url.contains("redirect_uri=" + CALLBACK), url);
        assertTrue(stateOf(url).startsWith(professionalId + "."));
    }

    @Test
    void comingBack_savesTheAccountsEmailAndHolder_andItsTokensEncrypted() {
        MercadoPagoAccountLink link = link(NOW);
        String state = link.state(professionalId);
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/oauth/token"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.code").value("the-code"))
                .andExpect(jsonPath("$.redirect_uri").value(CALLBACK))
                .andExpect(jsonPath("$.client_secret").value("secret"))
                .andExpect(jsonPath("$.test_token").value(false))
                .andRespond(withSuccess("{\"access_token\":\"APP_USR-theirs\",\"refresh_token\":\"TG-refresh\",\"expires_in\":15552000,\"user_id\":987}", MediaType.APPLICATION_JSON));
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/users/me"))
                .andExpect(header("Authorization", "Bearer APP_USR-theirs"))
                .andRespond(withSuccess("""
                        {"id":987,"email":"ana@correo.com","nickname":"ANA1","first_name":"Ana","last_name":"Pérez"}""",
                        MediaType.APPLICATION_JSON));

        assertEquals(SITE + "/profile/edit?mercadopago=linked", link.finish("the-code", state, null));

        mp.verify();
        assertEquals("Mercado Pago · ana@correo.com · Ana Pérez", professional.getPayoutAccount());
        assertEquals("987", professional.getPayoutMpUserId());
        assertNotEquals("APP_USR-theirs", professional.getMpAccessToken());
        assertEquals("APP_USR-theirs", link.accessToken(professional));
        assertEquals("TG-refresh", link.decrypt(professional.getMpRefreshToken()));
        verify(professionalRepository).save(professional);
    }

    @Test
    void anAboutToExpireToken_isRefreshedBeforeUse_replacingBothTokens() {
        MercadoPagoAccountLink link = link(NOW);
        professional.setMpAccessToken(link.encrypt("APP_USR-old"));
        professional.setMpRefreshToken(link.encrypt("TG-old"));
        professional.setMpTokenExpiresAt(OffsetDateTime.ofInstant(NOW.plus(Duration.ofHours(2)), ZoneOffset.UTC));
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/oauth/token"))
                .andExpect(jsonPath("$.grant_type").value("refresh_token"))
                .andExpect(jsonPath("$.refresh_token").value("TG-old"))
                .andRespond(withSuccess("""
                        {"access_token":"APP_USR-new","refresh_token":"TG-new","expires_in":15552000}""",
                        MediaType.APPLICATION_JSON));

        assertEquals("APP_USR-new", link.accessToken(professional));
        assertEquals("TG-new", link.decrypt(professional.getMpRefreshToken()));
        verify(professionalRepository).save(professional);
    }

    @Test
    void aTokenThatCantBeRefreshed_asksToLinkAgain() {
        MercadoPagoAccountLink link = link(NOW);
        professional.setMpAccessToken(link.encrypt("APP_USR-old"));
        professional.setMpRefreshToken(link.encrypt("TG-old"));
        professional.setMpTokenExpiresAt(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/oauth/token")).andRespond(withStatus(HttpStatus.BAD_REQUEST));

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> link.accessToken(professional));
        assertEquals(502, e.getStatusCode().value());
    }

    @Test
    void aProfessionalWhoDidntLink_hasNoToken() {
        assertNull(link(NOW).accessToken(professional));
    }

    @Test
    void aForgedOrExpiredState_linksNothing() {
        String state = link(NOW).state(professionalId);
        String forged = UUID.randomUUID() + state.substring(state.indexOf('.'));

        assertEquals(SITE + "/profile/edit?mercadopago=error", link(NOW).finish("code", forged, null));
        assertEquals(SITE + "/profile/edit?mercadopago=error", link(NOW.plus(Duration.ofHours(1))).finish("code", state, null));
        assertEquals(SITE + "/profile/edit?mercadopago=error", link(NOW).finish("code", "garbage", null));
        assertEquals(SITE + "/profile/edit?mercadopago=error", link(NOW).finish("code", null, null));
        mp.verify();
        verify(professionalRepository, never()).save(any());
    }

    @Test
    void notAuthorizing_orMercadoPagoFailing_leavesTheAccountAsItWas() {
        MercadoPagoAccountLink link = link(NOW);
        assertEquals(SITE + "/profile/edit?mercadopago=cancelled", link.finish(null, link.state(professionalId), "access_denied"));

        mp.expect(requestTo(MercadoPagoGateway.API_URL + "/oauth/token")).andRespond(withServerError());
        assertEquals(SITE + "/profile/edit?mercadopago=error", link.finish("code", link.state(professionalId), null));
        assertNull(professional.getPayoutMpUserId());
        verify(professionalRepository, never()).save(any());
    }

    @Test
    void withoutTheAppsCredentials_linkingIsOff() {
        MercadoPagoAccountLink off = new MercadoPagoAccountLink(builder, professionalRepository, Clock.systemUTC(), "", "", "", SITE, false);

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> off.authorizationUrl(professionalId));
        assertEquals(503, e.getStatusCode().value());
    }
}
