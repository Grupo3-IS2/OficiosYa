package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ExpertiseTradeCreateRequest;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.update.ExpertiseTradeUpdateRequest;
import com.um.uy.oficiosya.dto.update.ProfessionalUpdateRequest;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The professional's own profile under /me, and the public lookup and search. */
class ProfessionalControllerTest {

    private static final String BASE = "/api/v1/professionals";

    @Mock
    private ProfessionalService professionalService;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final Authentication authentication =
            new UsernamePasswordAuthenticationToken(userId.toString(), "n/a", List.of());
    private final ProfessionalResponse profile = new ProfessionalResponse();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new ProfessionalController(professionalService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        profile.setName("Beto Gómez");
    }

    private MockHttpServletRequestBuilder signedIn(MockHttpServletRequestBuilder request, String body) {
        return request.principal(authentication).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void getMyProfile() throws Exception {
        when(professionalService.getProfessional(userId)).thenReturn(profile);

        mvc.perform(get(BASE + "/me").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Beto Gómez"));
    }

    @Test
    void updateProfessional() throws Exception {
        when(professionalService.updateProfessional(any(ProfessionalUpdateRequest.class), eq(userId))).thenReturn(profile);

        mvc.perform(signedIn(patch(BASE + "/me"), """
                        {"workingLocation":"Canelones"}"""))
                .andExpect(status().isOk());
    }

    @Test
    void getProfessional_isThePublicView() throws Exception {
        UUID id = UUID.randomUUID();
        when(professionalService.getPublicProfessional(id)).thenReturn(new ProfessionalPublicResponse());

        mvc.perform(get(BASE + "/" + id)).andExpect(status().isOk());
    }

    /** Called directly: rendering a Page to JSON needs Spring Data's web config, which a standalone MockMvc lacks. */
    @Test
    void searchProfessionals_passesTheFilters() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<ProfessionalPublicResponse> page = new PageImpl<>(List.of(new ProfessionalPublicResponse()));
        when(professionalService.searchProfessionals(List.of(1L, 2L), new BigDecimal("100"), null, 5.0,
                "Montevideo", "beto", pageable)).thenReturn(page);

        ResponseEntity<Page<ProfessionalPublicResponse>> response = new ProfessionalController(professionalService)
                .searchProfessionals(List.of(1L, 2L), new BigDecimal("100"), null, 5.0, "Montevideo", "beto", pageable);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(page, response.getBody());
    }

    @Test
    void publishAndUnpublish() throws Exception {
        when(professionalService.publishProfessional(userId)).thenReturn(profile);
        when(professionalService.unpublishProfessional(userId)).thenReturn(profile);

        mvc.perform(post(BASE + "/me/publish").principal(authentication)).andExpect(status().isOk());
        mvc.perform(post(BASE + "/me/unpublish").principal(authentication)).andExpect(status().isOk());
    }

    @Test
    void addExpertiseTrade_answers201() throws Exception {
        when(professionalService.addExpertiseTrade(eq(userId), any(ExpertiseTradeCreateRequest.class))).thenReturn(profile);

        mvc.perform(signedIn(post(BASE + "/me/expertise-trades"), """
                        {"tradeId":1,"minimumHourlyWage":100,"maximumHourlyWage":200}"""))
                .andExpect(status().isCreated());
    }

    @Test
    void updateAndRemoveExpertiseTrade() throws Exception {
        when(professionalService.updateExpertiseTrade(eq(userId), eq(4L), any(ExpertiseTradeUpdateRequest.class)))
                .thenReturn(profile);
        when(professionalService.removeExpertiseTrade(userId, 4L)).thenReturn(profile);

        mvc.perform(signedIn(patch(BASE + "/me/expertise-trades/4"), """
                        {"maximumHourlyWage":250}"""))
                .andExpect(status().isOk());
        mvc.perform(delete(BASE + "/me/expertise-trades/4").principal(authentication))
                .andExpect(status().isOk());
    }
}
